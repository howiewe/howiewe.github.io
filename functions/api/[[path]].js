// functions/api/[[path]].js (D1 批次匯入修正版)

// --- 統一的 API 響應格式 ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
});

// --- API 路由處理 ---
export async function onRequest(context) {
    const { request, env } = context;
    if (!env.D1_DB || !env.IMAGE_BUCKET || !env.R2_PUBLIC_URL) {
        return response({ error: '後端環境變數未正確設定 (D1_DB, IMAGE_BUCKET, R2_PUBLIC_URL)' }, 500);
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
                 // 【關鍵修正】確保路由指向新的批次建立函式
                 if (method === 'POST') return await handleBatchCreateV2(db, await request.json());
                 break;
        }
        return response({ error: `無效的 API 路徑或方法: ${url.pathname}` }, 404);
    } catch (e) {
        console.error("API Error:", e, "Request:", { method, url: request.url });
        return response({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}

// --- 資料庫操作函式 (除了 handleBatchCreate 其他不變) ---

async function getAllData(db) { /* ... 保持不變 ... */ 
    const productsQuery = db.prepare("SELECT * FROM products ORDER BY id DESC");
    const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY name ASC");
    const [productsResult, categoriesResult] = await db.batch([productsQuery, categoriesQuery]);
    const products = (productsResult.results || []).map(p => ({ ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] }));
    return response({ products, categories: categoriesResult.results || [] });
}
async function createOrUpdateProduct(db, product) { /* ... 保持不變 ... */ 
    const { id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId } = product;
    const imageUrlsJson = JSON.stringify(imageUrls || []);
    let results;
    if (id) {
        ({ results } = await db.prepare(`UPDATE products SET sku = ?, name = ?, ean13 = ?, price = ?, description = ?, imageUrls = ?, imageSize = ?, categoryId = ? WHERE id = ? RETURNING *`).bind(sku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId, id).run());
    } else {
        const newId = Date.now();
        ({ results } = await db.prepare(`INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(newId, sku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId).run());
    }
    const finalProduct = { ...results[0], imageUrls: JSON.parse(results[0].imageUrls) };
    return response(finalProduct, id ? 200 : 201);
}
async function deleteProduct(db, id) { /* ... 保持不變 ... */ 
    const { success } = await db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
    if (!success) throw new Error("刪除產品失敗");
    return response({ message: '產品已刪除' });
}
async function createOrUpdateCategory(db, category) { /* ... 保持不變 ... */ 
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
async function deleteCategory(db, id) { /* ... 保持不變 ... */ 
    const { count } = await db.prepare("SELECT count(*) as count FROM categories WHERE parentId = ?").bind(id).first();
    if (count > 0) return response({ error: '無法刪除！請先刪除其所有子分類。' }, 400);
    const { product_count } = await db.prepare("SELECT count(*) as product_count FROM products WHERE categoryId = ?").bind(id).first();
    if (product_count > 0) return response({ error: '無法刪除！尚有產品使用此分類。' }, 400);
    await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return response({ message: '分類已刪除' });
}
async function handleImageUpload(context, fileName) { /* ... 保持不變 ... */ 
    const { request, env } = context;
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    if (!fileName) return response({ error: '缺少檔名' }, 400);
    const object = await IMAGE_BUCKET.put(fileName, request.body, { httpMetadata: { contentType: request.headers.get('content-type') }, });
    const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
    return response({ message: '上傳成功', url: publicUrl, key: object.key });
}


// --- 【全新升級的批次建立函式】 ---
async function handleBatchCreateV2(db, { products: newProducts }) {
    if (!newProducts || !Array.isArray(newProducts) || newProducts.length === 0) {
        return response({ error: '無效或空的產品資料' }, 400);
    }
    
    // 使用一個 Map 來快取已處理的分類路徑，避免重複查詢資料庫
    const categoryCache = new Map();
    // 預先載入所有現有分類
    const { results: existingCategories } = await db.prepare("SELECT * FROM categories").run();
    
    // 這個函式是核心：它會處理 "A > B > C" 這樣的路徑
    async function getCategoryId(categoryPath) {
        const path = (categoryPath || '未分類').trim();
        if (categoryCache.has(path)) {
            return categoryCache.get(path);
        }

        const names = path.split('>').map(name => name.trim()).filter(Boolean);
        let parentId = null;

        for (const name of names) {
            let category = existingCategories.find(c => c.name === name && c.parentId === parentId);
            
            if (category) {
                parentId = category.id;
            } else {
                // 如果在現有分類中找不到，就在資料庫中建立它
                const newId = Date.now() + Math.random(); // 產生唯一的 ID
                const { results } = await db.prepare("INSERT INTO categories (id, name, parentId) VALUES (?, ?, ?) RETURNING *")
                                          .bind(newId, name, parentId)
                                          .run();
                const newCategory = results[0];
                existingCategories.push(newCategory); // 將新建的分類加入到我們的"快取"中
                parentId = newCategory.id;
            }
        }
        
        categoryCache.set(path, parentId);
        return parentId;
    }

    const productStatements = [];
    for (const p of newProducts) {
        // 為每個產品異步獲取或建立其分類 ID
        const categoryId = await getCategoryId(p.category);
        
        productStatements.push(
            db.prepare(
                 `INSERT INTO products (id, sku, name, price, ean13, description, imageUrls, categoryId, imageSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
                Date.now() + Math.random(), // 產生唯一的產品 ID
                p.sku || null,
                p.name,
                parseFloat(p.price) || 0,
                p.ean13 || null,
                p.description || '',
                JSON.stringify(p.imageUrls || []),
                categoryId,
                90
            )
        );
    }
    
    // 使用 D1 的批次功能一次性執行所有 INSERT 語句
    if (productStatements.length > 0) {
        await db.batch(productStatements);
    }
    
    return response({ 
        success: true, 
        message: `成功匯入 ${newProducts.length} 筆產品。` 
    });
}