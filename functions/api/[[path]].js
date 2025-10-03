// functions/api/[[path]].js (純淨版 - 無需向下相容)

// --- 統一的 API 響應格式 ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
});

// --- API 路由處理 ---
export async function onRequest(context) {
    const { request, env } = context;
    if (!env.D1_DB || !env.IMAGE_BUCKET || !env.R2_PUBLIC_URL) {
        return response({ error: '後端環境變數未正確設定' }, 500);
    }

    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const resource = pathSegments[1];
    const id = pathSegments[2];
    const method = request.method;

    try {
        const db = env.D1_DB;
        switch (resource) {
            case 'all-data':
                if (method === 'GET') return await getCategoriesOnly(db);
                break;
            case 'products':
                if (method === 'GET') return await getPaginatedProducts(db, url.searchParams);
                if (method === 'POST') return await createOrUpdateProduct(db, await request.json());
                if (method === 'DELETE' && id) return await deleteProduct(context, id);
                break;
            case 'categories':
                if (method === 'POST') return await createOrUpdateCategory(db, await request.json());
                if (method === 'DELETE' && id) return await deleteCategory(db, id);
                break;
            case 'reorder-categories':
                if (method === 'POST') return await handleCategoryReorder(db, await request.json());
                break;
            case 'upload':
                if (method === 'PUT' && id) return await handleImageUpload(context, id);
                break;
            case 'batch-create':
                if (method === 'POST') return await handleBatchCreateV2(db, await request.json());
                break;
        }
        return response({ error: `無效的 API 路徑或方法: ${url.pathname}` }, 404);
    } catch (e) {
        console.error("API Error:", e, "Request:", { method, url: request.url });
        return response({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}

// --- 資料庫與 R2 操作函式 ---

async function getCategoriesOnly(db) {
    const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY parentId, sortOrder ASC");
    const { results } = await categoriesQuery.run();
    return response({ categories: results || [] });
}

// 【全新簡潔版】getPaginatedProducts
async function getPaginatedProducts(db, params) {
    // 參數解析和 SQL 查詢部分不變
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
        whereClauses.push(`(name LIKE ? OR sku LIKE ?)`);
        bindings.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countQueryString = `SELECT COUNT(*) as total FROM products ${whereString}`;
    const dataQueryString = `SELECT * FROM products ${whereString} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
    const countQuery = db.prepare(countQueryString).bind(...bindings);
    const dataQuery = db.prepare(dataQueryString).bind(...bindings, limit, offset);

    const [countResult, dataResult] = await db.batch([countQuery, dataQuery]);

    const totalProducts = countResult.results[0].total;
    const totalPages = Math.ceil(totalProducts / limit);

    // ▼▼▼ *** 簡化後的邏輯 *** ▼▼▼
    // 直接解析 imageUrls，不再需要檢查格式
    const products = (dataResult.results || []).map(p => {
        try {
            return { ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] };
        } catch (e) {
            return { ...p, imageUrls: [] }; // 解析失敗時返回空陣列
        }
    });
    // ▲▲▲ *** 簡化結束 *** ▲▲▲

    return response({
        products,
        pagination: { currentPage: page, totalPages, totalProducts, limit }
    });
}

// 【全新簡潔版】createOrUpdateProduct
async function createOrUpdateProduct(db, product) {
    const { id, name, ean13, price, description, imageUrls, categoryId } = product;
    const finalSku = (product.sku === '' || product.sku === undefined) ? null : product.sku;
    // 直接儲存包含 url 和 size 的物件陣列
    const imageUrlsJson = JSON.stringify(imageUrls || []);
    const now = new Date().toISOString();
    let results;

    if (id) {
        // 不再包含 imageSize 欄位
        ({ results } = await db.prepare(
            `UPDATE products SET sku = ?, name = ?, ean13 = ?, price = ?, description = ?, imageUrls = ?, categoryId = ?, updatedAt = ? WHERE id = ? RETURNING *`
        ).bind(finalSku, name, ean13, price, description, imageUrlsJson, categoryId, now, id).run());
    } else {
        // 不再包含 imageSize 欄位
        ({ results } = await db.prepare(
            `INSERT INTO products (sku, name, ean13, price, description, imageUrls, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).bind(finalSku, name, ean13, price, description, imageUrlsJson, categoryId, now, now).run());
    }

    if (!results || results.length === 0) throw new Error("資料庫操作失敗，未返回任何結果。");
    const finalProduct = { ...results[0], imageUrls: JSON.parse(results[0].imageUrls || '[]') };
    return response(finalProduct, id ? 200 : 201);
}

// ... 此處省略的其他後端函式 (deleteProduct, handleCategoryReorder 等) 保持不變 ...
async function deleteProduct(context, id) {
    const { env } = context;
    const { D1_DB, IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    const product = await D1_DB.prepare("SELECT imageUrls FROM products WHERE id = ?").bind(id).first();
    if (!product) { return response({ message: '產品不存在或已被刪除' }); }
    await D1_DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    let imageUrls = [];
    try { if (product.imageUrls) { imageUrls = JSON.parse(product.imageUrls); } } catch (e) {
        console.error(`無法解析產品 ${id} 的 imageUrls JSON 字串:`, product.imageUrls);
        return response({ message: '產品已刪除，但其圖片連結格式錯誤，無法清理 R2 檔案。' });
    }
    // 新的 imageUrls 格式是物件陣列，需要提取 url 屬性
    if (imageUrls && imageUrls.length > 0) {
        const keysToDelete = imageUrls.map(item => item.url).filter(Boolean).map(url => { if (url.startsWith(R2_PUBLIC_URL)) { return url.substring(R2_PUBLIC_URL.length + 1); } return null; }).filter(key => key);
        if (keysToDelete.length > 0) { await IMAGE_BUCKET.delete(keysToDelete); }
    }
    return response({ message: '產品及其相關圖片已成功刪除' });
}

async function createOrUpdateCategory(db, category) {
    const { id, name, parentId = null } = category;
    const now = new Date().toISOString();
    let results;

    if (id) {
        ({ results } = await db.prepare(
            "UPDATE categories SET name = ?, parentId = ?, updatedAt = ? WHERE id = ? RETURNING *"
        ).bind(name, parentId, now, id).run());
    } else {
        const { maxOrder } = await db.prepare(
            "SELECT MAX(sortOrder) as maxOrder FROM categories WHERE parentId IS ?"
        ).bind(parentId).first();
        const newSortOrder = (maxOrder ?? -1) + 1;
        ({ results } = await db.prepare(
            "INSERT INTO categories (name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) RETURNING *"
        ).bind(name, parentId, newSortOrder, now, now).run());
    }

    if (!results || results.length === 0) throw new Error("分類操作失敗，未返回任何結果。");
    return response(results[0], id ? 200 : 201);
}

async function handleCategoryReorder(db, reorderData) {
    if (!reorderData || !Array.isArray(reorderData) || reorderData.length === 0) {
        return response({ error: '無效或空的排序資料' }, 400);
    }
    const statements = reorderData.map(cat =>
        db.prepare("UPDATE categories SET parentId = ?, sortOrder = ?, updatedAt = ? WHERE id = ?")
            .bind(cat.parentId, cat.sortOrder, new Date().toISOString(), cat.id)
    );
    await db.batch(statements);
    return response({ success: true, message: `成功更新 ${reorderData.length} 個分類的順序。` });
}

async function deleteCategory(db, id) {
    const { count } = await db.prepare("SELECT count(*) as count FROM categories WHERE parentId = ?").bind(id).first();
    if (count > 0) return response({ error: '無法刪除！請先刪除其所有子分類。' }, 400);
    const { product_count } = await db.prepare("SELECT count(*) as product_count FROM products WHERE categoryId = ?").bind(id).first();
    if (product_count > 0) return response({ error: '無法刪除！尚有產品使用此分類。' }, 400);
    await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return response({ message: '分類已刪除' });
}

async function handleImageUpload(context, fileName) {
    const { request, env } = context;
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    if (!fileName) return response({ error: '缺少檔名' }, 400);
    const object = await IMAGE_BUCKET.put(fileName, request.body, { httpMetadata: { contentType: request.headers.get('content-type') }, });
    const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
    return response({ message: '上傳成功', url: publicUrl, key: object.key });
}

async function handleBatchCreateV2(db, { products: newProducts }) {
    if (!newProducts || !Array.isArray(newProducts) || newProducts.length === 0) return response({ error: '無效或空的產品資料' }, 400);
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
        // 為批次上傳的圖片加上預設 size
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
    return response({ success: true, message: `成功匯入 ${newProducts.length} 筆產品。` });
}