// functions/api/[[path]].js (R2 圖片連動刪除修正版)

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
                // 【修正】將整個 context 傳入，以便函式能同時存取 DB 和 R2
                if (method === 'DELETE' && id) return await deleteProduct(context, id);
                break;
            case 'categories':
                 if (method === 'POST') return await createOrUpdateCategory(db, await request.json());
                 if (method === 'DELETE' && id) return await deleteCategory(db, id);
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

async function getAllData(db) { /* ... 此函式保持不變 ... */ 
    const productsQuery = db.prepare("SELECT * FROM products ORDER BY id DESC");
    const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY name ASC");
    const [productsResult, categoriesResult] = await db.batch([productsQuery, categoriesQuery]);
    const products = (productsResult.results || []).map(p => {
        try {
            return { ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] };
        } catch(e) {
            console.error(`Failed to parse imageUrls for product id ${p.id}:`, p.imageUrls);
            return { ...p, imageUrls: [] };
        }
    });
    return response({ products, categories: categoriesResult.results || [] });
}

async function createOrUpdateProduct(db, product) { /* ... 此函式保持不變 ... */ 
    const { id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId } = product;
    const imageUrlsJson = JSON.stringify(imageUrls || []);
    let results;
    if (id) {
        ({ results } = await db.prepare(`UPDATE products SET sku = ?, name = ?, ean13 = ?, price = ?, description = ?, imageUrls = ?, imageSize = ?, categoryId = ? WHERE id = ? RETURNING *`).bind(sku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId, id).run());
    } else {
        ({ results } = await db.prepare(`INSERT INTO products (sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(sku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId).run());
    }
    if (!results || results.length === 0) throw new Error("資料庫操作失敗，未返回任何結果。");
    const finalProduct = { ...results[0], imageUrls: JSON.parse(results[0].imageUrls) };
    return response(finalProduct, id ? 200 : 201);
}

// --- 【全新改造的刪除函式】 ---
async function deleteProduct(context, id) {
    const { env } = context;
    const { D1_DB, IMAGE_BUCKET, R2_PUBLIC_URL } = env;

    // 1. 先從 D1 讀取產品資料，以獲取圖片 URL 列表
    const product = await D1_DB.prepare("SELECT imageUrls FROM products WHERE id = ?").bind(id).first();
    
    // 如果產品不存在，直接回報成功 (因為目標 "讓產品消失" 已經達成)
    if (!product) {
        return response({ message: '產品不存在或已被刪除' });
    }

    // 2. 從 D1 中刪除產品紀錄
    await D1_DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();

    // 3. 解析圖片 URL 並從 R2 中刪除對應的檔案
    let imageUrls = [];
    try {
        if (product.imageUrls) {
            imageUrls = JSON.parse(product.imageUrls);
        }
    } catch (e) {
        console.error(`無法解析產品 ${id} 的 imageUrls JSON 字串:`, product.imageUrls);
        // 即使解析失敗，資料庫紀錄也已刪除，所以仍回傳成功，但會在後台留下日誌
        return response({ message: '產品已刪除，但其圖片連結格式錯誤，無法清理 R2 檔案。' });
    }

    if (imageUrls && imageUrls.length > 0) {
        // 從完整的公開 URL 中萃取出 R2 物件的 Key (檔名)
        // 例如: "https://pub-....dev/batch-img_...webp" -> "batch-img_...webp"
        // **重要**: 請確保您的 R2_PUBLIC_URL 環境變數結尾 *沒有* 斜線 "/"
        const keysToDelete = imageUrls
            .map(url => {
                if (url.startsWith(R2_PUBLIC_URL)) {
                    return url.substring(R2_PUBLIC_URL.length + 1);
                }
                return null;
            })
            .filter(key => key); // 過濾掉空值

        // 使用 R2 的批次刪除功能，高效地一次性刪除所有圖片
        if (keysToDelete.length > 0) {
            await IMAGE_BUCKET.delete(keysToDelete);
        }
    }

    return response({ message: '產品及其相關圖片已成功刪除' });
}


async function createOrUpdateCategory(db, category) { /* ... 此函式保持不變 ... */ 
    const { id, name, parentId = null } = category;
    let results;
    if (id) {
        ({ results } = await db.prepare("UPDATE categories SET name = ?, parentId = ? WHERE id = ? RETURNING *").bind(name, parentId, id).run());
    } else {
        ({ results } = await db.prepare("INSERT INTO categories (name, parentId) VALUES (?, ?) RETURNING *").bind(name, parentId).run());
    }
     if (!results || results.length === 0) throw new Error("分類操作失敗，未返回任何結果。");
    return response(results[0], id ? 200 : 201);
}

async function deleteCategory(db, id) { /* ... 此函式保持不變 ... */ 
    const { count } = await db.prepare("SELECT count(*) as count FROM categories WHERE parentId = ?").bind(id).first();
    if (count > 0) return response({ error: '無法刪除！請先刪除其所有子分類。' }, 400);
    const { product_count } = await db.prepare("SELECT count(*) as product_count FROM products WHERE categoryId = ?").bind(id).first();
    if (product_count > 0) return response({ error: '無法刪除！尚有產品使用此分類。' }, 400);
    await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return response({ message: '分類已刪除' });
}

async function handleImageUpload(context, fileName) { /* ... 此函式保持不變 ... */ 
    const { request, env } = context;
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    if (!fileName) return response({ error: '缺少檔名' }, 400);
    const object = await IMAGE_BUCKET.put(fileName, request.body, { httpMetadata: { contentType: request.headers.get('content-type') }, });
    const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
    return response({ message: '上傳成功', url: publicUrl, key: object.key });
}

async function handleBatchCreateV2(db, { products: newProducts }) { /* ... 此函式保持不變 ... */
    if (!newProducts || !Array.isArray(newProducts) || newProducts.length === 0) return response({ error: '無效或空的產品資料' }, 400);
    const categoryCache = new Map();
    const { results: existingCategories } = await db.prepare("SELECT * FROM categories").run();
    const allCategories = existingCategories || [];
    async function getCategoryId(categoryPath) {
        const path = (categoryPath || '未分類').trim();
        if (categoryCache.has(path)) return categoryCache.get(path);
        const names = path.split('>').map(name => name.trim()).filter(Boolean);
        let parentId = null;
        for (const name of names) {
            let category = allCategories.find(c => c.name === name && c.parentId === parentId);
            if (category) { parentId = category.id; } 
            else {
                const { results } = await db.prepare("INSERT INTO categories (name, parentId) VALUES (?, ?) RETURNING *").bind(name, parentId).run();
                const newCategory = results[0];
                allCategories.push(newCategory);
                parentId = newCategory.id;
            }
        }
        categoryCache.set(path, parentId);
        return parentId;
    }
    const productStatements = [];
    for (const p of newProducts) {
        const categoryId = await getCategoryId(p.category);
        productStatements.push(
            db.prepare(`INSERT INTO products (sku, name, price, ean13, description, imageUrls, categoryId, imageSize) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(p.sku || null, p.name, parseFloat(p.price) || 0, p.ean13 || null, p.description || '', JSON.stringify(p.imageUrls || []), categoryId, 90)
        );
    }
    if (productStatements.length > 0) await db.batch(productStatements);
    return response({ success: true, message: `成功匯入 ${newProducts.length} 筆產品。` });
}