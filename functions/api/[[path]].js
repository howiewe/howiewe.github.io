// functions/api/[[path]].js (D1 資料庫優化版 - 使用 D1_DB 變數)

// --- 統一的 API 響應格式 ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
});

// --- API 路由處理 ---
export async function onRequest(context) {
    const { request, env } = context;
    // 檢查新的 D1_DB 變數是否存在
    if (!env.D1_DB || !env.IMAGE_BUCKET || !env.R2_PUBLIC_URL) {
        return response({ error: '後端環境變數未正確設定 (D1_DB, IMAGE_BUCKET, R2_PUBLIC_URL)' }, 500);
    }
    
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const resource = pathSegments[1];
    const id = pathSegments[2];
    const method = request.method;

    try {
        // 將 env.D1_DB 作為資料庫操作物件傳入
        const db = env.D1_DB;

        switch (resource) {
            case 'all-data':
                if (method === 'GET') return await getAllData(db);
                break;
            case 'products':
                if (method === 'POST') return await createOrUpdateProduct(db, await request.json());
                if (method === 'DELETE' && id) return await deleteProduct(db, id);
                break;
            case 'categories':
                 if (method === 'POST') return await createOrUpdateCategory(db, await request.json());
                 if (method === 'DELETE' && id) return await deleteCategory(db, id);
                 break;
            case 'upload':
                if (method === 'PUT' && id) return await handleImageUpload(context, id);
                break;
            case 'batch-create':
                 if (method === 'POST') return await handleBatchCreate(db, await request.json());
                 break;
        }
        return response({ error: `無效的 API 路徑或方法: ${url.pathname}` }, 404);
    } catch (e) {
        console.error("API Error:", e, "Request:", { method, url: request.url });
        return response({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}

// --- 資料庫操作函式 (所有函式的第一個參數都是 db 物件) ---

async function getAllData(db) {
    const productsQuery = db.prepare("SELECT * FROM products ORDER BY id DESC");
    const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY name ASC");
    const [productsResult, categoriesResult] = await db.batch([productsQuery, categoriesQuery]);
    
    const products = (productsResult.results || []).map(p => ({
        ...p,
        imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : []
    }));

    return response({ products, categories: categoriesResult.results || [] });
}

async function createOrUpdateProduct(db, product) {
    const { id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId } = product;
    const imageUrlsJson = JSON.stringify(imageUrls || []);

    let results;
    if (id) {
        ({ results } = await db.prepare(
            `UPDATE products SET sku = ?, name = ?, ean13 = ?, price = ?, description = ?, imageUrls = ?, imageSize = ?, categoryId = ? WHERE id = ? RETURNING *`
        ).bind(sku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId, id).run());
    } else {
        const newId = Date.now();
        ({ results } = await db.prepare(
            `INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).bind(newId, sku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId).run());
    }
    // D1 `RETURNING` 回來的資料 imageUrls 還是字串，需要手動解析回傳給前端
    const finalProduct = { ...results[0], imageUrls: JSON.parse(results[0].imageUrls) };
    return response(finalProduct, id ? 200 : 201);
}

async function deleteProduct(db, id) {
    const { success } = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    if (!success) throw new Error("刪除產品失敗");
    return response({ message: '產品已刪除' });
}

async function createOrUpdateCategory(db, category) {
    const { id, name, parentId } = category;
    let results;
    if (id) {
        ({ results } = await db.prepare("UPDATE categories SET name = ?, parentId = ? WHERE id = ? RETURNING *").bind(name, parentId, id).run());
    } else {
        const newId = Date.now();
        ({ results } = await db.prepare("INSERT INTO categories (id, name, parentId) VALUES (?, ?, ?) RETURNING *").bind(newId, name, parentId).run());
    }
    return response(results[0], id ? 200 : 201);
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
    const object = await IMAGE_BUCKET.put(fileName, request.body, {
        httpMetadata: { contentType: request.headers.get('content-type') },
    });
    const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
    return response({ message: '上傳成功', url: publicUrl, key: object.key });
}

async function handleBatchCreate(db, { products: newProducts }) {
    if (!newProducts || !Array.isArray(newProducts)) {
        return response({ error: '無效的產品資料格式' }, 400);
    }
    
    const statements = [];
    const allCategories = (await db.prepare("SELECT * FROM categories").run()).results;
    let newCategoriesToAdd = [];

    function getOrCreateCategoryId(categoryPath) {
        const categoryNames = (categoryPath || '未分類').split('>').map(name => name.trim()).filter(Boolean);
        let currentParentId = null;
        
        for (const name of categoryNames) {
            let category = allCategories.find(c => c.name === name && c.parentId === currentParentId);
            if (!category) {
                 category = newCategoriesToAdd.find(c => c.name === name && c.parentId === currentParentId);
            }
            if (category) {
                currentParentId = category.id;
            } else {
                const newId = Date.now() + newCategoriesToAdd.length + Math.random();
                const newCategory = { id: newId, name, parentId: currentParentId };
                newCategoriesToAdd.push(newCategory);
                allCategories.push(newCategory);
                currentParentId = newId;
            }
        }
        return currentParentId;
    }

    newProducts.forEach(p => getOrCreateCategoryId(p.category));
    newCategoriesToAdd.forEach(c => {
        statements.push(db.prepare("INSERT INTO categories (id, name, parentId) VALUES (?, ?, ?)")
            .bind(c.id, c.name, c.parentId));
    });

    newProducts.forEach(p => {
        const categoryId = getOrCreateCategoryId(p.category);
        statements.push(db.prepare(
             `INSERT INTO products (id, sku, name, price, ean13, description, imageUrls, categoryId, imageSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            Date.now() + Math.random(),
            p.sku, p.name, parseFloat(p.price) || 0, p.ean13, p.description,
            JSON.stringify(p.imageUrls || []), categoryId, 90
        ));
    });

    if(statements.length > 0) {
        await db.batch(statements);
    }
    
    return response({ success: true, message: `成功匯入 ${newProducts.length} 筆產品與 ${newCategoriesToAdd.length} 筆新分類` });
}