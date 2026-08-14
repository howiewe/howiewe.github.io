// functions/_lib/db.js
import { jsonResponse } from './utils.js';
import { deleteR2ImagesByUrls } from './r2.js';

export async function getCategoriesOnly(db) {
    const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY parentId, sortOrder ASC");
    const { results } = await categoriesQuery.run();
    return jsonResponse({ categories: results || [] });
}

export async function getPaginatedProducts(db, params) {
    const categoryIdsParam = params.get('categoryIds');

    if (categoryIdsParam) {
        const ids = categoryIdsParam.split(',').map(id => parseInt(id.trim())).filter(Number.isInteger);

        if (ids.length === 0) {
            return jsonResponse({ products: [], pagination: {} });
        }

        const placeholders = ids.map(() => '?').join(',');
        const query = db.prepare(`
            WITH RECURSIVE category_path AS (
                SELECT 
                    id, 
                    printf('%04d', sortOrder) as sort_path
                FROM 
                    categories
                WHERE 
                    parentId IS NULL

                UNION ALL

                SELECT 
                    c.id, 
                    cp.sort_path || '_' || printf('%04d', c.sortOrder)
                FROM 
                    categories c
                INNER JOIN 
                    category_path cp ON c.parentId = cp.id
            )
            SELECT 
                p.*
            FROM 
                products p
            INNER JOIN 
                category_path cp ON p.categoryId = cp.id
            WHERE 
                p.categoryId IN (${placeholders}) 
            ORDER BY
                CASE
                    WHEN EXISTS (SELECT 1 FROM categories sub WHERE sub.parentId = p.categoryId)
                    THEN cp.sort_path || '_~'
                    ELSE cp.sort_path
                END ASC,
                CASE WHEN p.price IS NULL OR p.price <= 0 THEN 1 ELSE 0 END ASC,
                p.price ASC
            LIMIT 500
        `);

        const { results } = await query.bind(...ids).run();

        const products = (results || []).map(p => {
            try {
                return { ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] };
            } catch (e) {
                return { ...p, imageUrls: [] };
            }
        });

        return jsonResponse({ products, pagination: { isCatalogMode: true, totalProducts: products.length } });
    }

    const page = parseInt(params.get('page')) || 1;
    const limit = parseInt(params.get('limit')) || 24;
    const categoryId = params.get('categoryId') ? parseInt(params.get('categoryId')) : null;
    const searchTerm = params.get('search') || '';
    const validSortBy = ['price', 'name', 'createdAt', 'updatedAt'];
    const sortBy = validSortBy.includes(params.get('sortBy')) ? params.get('sortBy') : 'updatedAt';
    const order = params.get('order')?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let bindings = [];
    if (categoryId) {
        const { results: allCategories } = await db.prepare("SELECT id, parentId FROM categories").run();
        const getSubCategoryIds = (startId) => {
            const ids = new Set([startId]);
            const queue = [startId];
            while (queue.length > 0) {
                const currentId = queue.shift();
                const children = allCategories.filter(c => c.parentId === currentId);
                for (const child of children) { ids.add(child.id); queue.push(child.id); }
            }
            return Array.from(ids);
        };
        const categoryIds = getSubCategoryIds(categoryId);
        whereClauses.push(`categoryId IN (${categoryIds.map(() => '?').join(',')})`);
        bindings.push(...categoryIds);
    }
    if (searchTerm) {
        whereClauses.push(`(name LIKE ? OR sku LIKE ? OR ean13 LIKE ?)`);
        bindings.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countQueryString = `SELECT COUNT(*) as total FROM products ${whereString}`;
    const dataQueryString = `SELECT * FROM products ${whereString} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
    const countQuery = db.prepare(countQueryString).bind(...bindings);
    const dataQuery = db.prepare(dataQueryString).bind(...bindings, limit, offset);

    const [countResult, dataResult] = await db.batch([countQuery, dataQuery]);

    const totalProducts = countResult.results[0].total;
    const totalPages = Math.ceil(totalProducts / limit);

    const products = (dataResult.results || []).map(p => {
        try {
            return { ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] };
        } catch (e) {
            return { ...p, imageUrls: [] };
        }
    });

    return jsonResponse({
        products,
        pagination: { currentPage: page, totalPages, totalProducts, limit }
    });
}

export async function getProductById(db, id) {
    const query = db.prepare("SELECT * FROM products WHERE id = ?");
    let product = await query.bind(id).first();

    if (!product) {
        return jsonResponse({ error: 'Product not found' }, 404);
    }

    try {
        product = { ...product, imageUrls: product.imageUrls ? JSON.parse(product.imageUrls) : [] };
    } catch (e) {
        console.error(`解析產品 ${id} 的 imageUrls 失敗:`, product.imageUrls);
        product = { ...product, imageUrls: [] };
    }

    return jsonResponse(product, 200);
}

export async function createOrUpdateProduct(context, product) {
    const { env } = context;
    const { D1_DB, IMAGE_BUCKET, R2_PUBLIC_URL } = env;

    const { id, name, sku, ean13, price, description, imageUrls, categoryId } = product;

    const finalSku = (sku === '' || sku === undefined) ? null : sku;
    const imageUrlsJson = JSON.stringify(imageUrls || []);
    const now = new Date().toISOString();
    let results;

    if (id) {
        const oldProduct = await D1_DB.prepare("SELECT imageUrls FROM products WHERE id = ?").bind(id).first();
        let oldUrls = [];
        if (oldProduct && oldProduct.imageUrls) {
            try {
                oldUrls = JSON.parse(oldProduct.imageUrls).map(item => item.url);
            } catch (e) {
                console.error(`無法解析產品 ${id} 的舊 imageUrls JSON 字串:`, oldProduct.imageUrls);
            }
        }

        const newUrls = (imageUrls || []).map(item => item.url);
        const urlsToDelete = oldUrls.filter(url => url && !newUrls.includes(url));

        ({ results } = await D1_DB.prepare(
            `UPDATE products SET sku = ?, name = ?, ean13 = ?, price = ?, description = ?, imageUrls = ?, categoryId = ?, updatedAt = ? WHERE id = ? RETURNING *`
        ).bind(finalSku, name, ean13, price, description, imageUrlsJson, categoryId, now, id).run());

        if (urlsToDelete.length > 0) {
            await deleteR2ImagesByUrls(IMAGE_BUCKET, R2_PUBLIC_URL, urlsToDelete);
        }
    } else {
        ({ results } = await D1_DB.prepare(
            `INSERT INTO products (sku, name, ean13, price, description, imageUrls, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).bind(finalSku, name, ean13, price, description, imageUrlsJson, categoryId, now, now).run());
    }

    if (!results || results.length === 0) {
        throw new Error("資料庫操作失敗，未返回任何結果。");
    }

    const finalProduct = { ...results[0], imageUrls: JSON.parse(results[0].imageUrls || '[]') };
    return jsonResponse(finalProduct, id ? 200 : 201);
}

export async function deleteProduct(context, id) {
    const { env } = context;
    const { D1_DB, IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    const product = await D1_DB.prepare("SELECT imageUrls FROM products WHERE id = ?").bind(id).first();
    if (!product) { return jsonResponse({ message: '產品不存在或已被刪除' }); }
    await D1_DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    let imageUrls = [];
    try { 
        if (product.imageUrls) { imageUrls = JSON.parse(product.imageUrls); } 
    } catch (e) {
        console.error(`無法解析產品 ${id} 的 imageUrls JSON 字串:`, product.imageUrls);
        return jsonResponse({ message: '產品已刪除，但其圖片連結格式錯誤，無法清理 R2 檔案。' });
    }
    
    if (imageUrls && imageUrls.length > 0) {
        const urls = imageUrls.map(item => item.url).filter(Boolean);
        await deleteR2ImagesByUrls(IMAGE_BUCKET, R2_PUBLIC_URL, urls);
    }
    return jsonResponse({ message: '產品及其相關圖片已成功刪除' });
}

export async function createOrUpdateCategory(db, category) {
    const { id, name, parentId = null, description = '' } = category;
    const now = new Date().toISOString();
    let results;

    if (id) {
        ({ results } = await db.prepare(
            "UPDATE categories SET name = ?, parentId = ?, description = ?, updatedAt = ? WHERE id = ? RETURNING *"
        ).bind(name, parentId, description, now, id).run());
    } else {
        const { maxOrder } = await db.prepare(
            "SELECT MAX(sortOrder) as maxOrder FROM categories WHERE parentId IS ?"
        ).bind(parentId).first();
        const newSortOrder = (maxOrder ?? -1) + 1;
        ({ results } = await db.prepare(
            "INSERT INTO categories (name, parentId, sortOrder, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
        ).bind(name, parentId, newSortOrder, description, now, now).run());
    }

    if (!results || results.length === 0) throw new Error("分類操作失敗，未返回任何結果。");
    return jsonResponse(results[0], id ? 200 : 201);
}

export async function handleCategoryReorder(db, reorderData) {
    if (!reorderData || !Array.isArray(reorderData) || reorderData.length === 0) {
        return jsonResponse({ error: '無效或空的排序資料' }, 400);
    }
    const statements = reorderData.map(cat =>
        db.prepare("UPDATE categories SET parentId = ?, sortOrder = ?, updatedAt = ? WHERE id = ?")
            .bind(cat.parentId, cat.sortOrder, new Date().toISOString(), cat.id)
    );
    await db.batch(statements);
    return jsonResponse({ success: true, message: `成功更新 ${reorderData.length} 個分類的順序。` });
}

export async function deleteCategory(db, id) {
    const { count } = await db.prepare("SELECT count(*) as count FROM categories WHERE parentId = ?").bind(id).first();
    if (count > 0) return jsonResponse({ error: '無法刪除！請先刪除其所有子分類。' }, 400);
    const { product_count } = await db.prepare("SELECT count(*) as product_count FROM products WHERE categoryId = ?").bind(id).first();
    if (product_count > 0) return jsonResponse({ error: '無法刪除！尚有產品使用此分類。' }, 400);
    await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return jsonResponse({ message: '分類已刪除' });
}

export async function handleBatchCreateV2(db, { products: newProducts }) {
    if (!newProducts || !Array.isArray(newProducts) || newProducts.length === 0) return jsonResponse({ error: '無效或空的產品資料' }, 400);
    const categoryCache = new Map();
    const { results: existingCategories } = await db.prepare("SELECT * FROM categories ORDER BY parentId, sortOrder ASC").run();
    const allCategories = existingCategories || [];
    async function getCategoryId(categoryPath) {
        const path = (categoryPath || '未分類').trim();
        if (categoryCache.has(path)) return categoryCache.get(path);
        const names = path.split('>').map(name => name.trim()).filter(Boolean);
        let parentId = null;
        for (const name of names) {
            let category = allCategories.find(c => c.name === name && c.parentId === parentId);
            if (category) {
                parentId = category.id;
            } else {
                const now = new Date().toISOString();
                const { maxOrder } = await db.prepare("SELECT MAX(sortOrder) as maxOrder FROM categories WHERE parentId IS ?").bind(parentId).first();
                const newSortOrder = (maxOrder ?? -1) + 1;
                const { results } = await db.prepare(
                    "INSERT INTO categories (name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) RETURNING *"
                ).bind(name, parentId, newSortOrder, now, now).run();
                const newCategory = results[0];
                allCategories.push(newCategory);
                parentId = newCategory.id;
            }
        }
        categoryCache.set(path, parentId);
        return parentId;
    }
    const productStatements = [];
    const nowForProducts = new Date().toISOString();
    for (const p of newProducts) {
        const categoryId = await getCategoryId(p.category);
        const imageUrlsWithDefaultSize = (p.imageUrls || []).map(url => ({ url, size: 90 }));
        productStatements.push(
            db.prepare(
                `INSERT INTO products (sku, name, price, ean13, description, imageUrls, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                p.sku || null, p.name, parseFloat(p.price) || 0, p.ean13 || null,
                p.description || '', JSON.stringify(imageUrlsWithDefaultSize),
                categoryId, nowForProducts, nowForProducts
            )
        );
    }
    if (productStatements.length > 0) await db.batch(productStatements);
    return jsonResponse({ success: true, message: `成功匯入 ${newProducts.length} 筆產品。` });
}
