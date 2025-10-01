// functions/api/[[path]].js (已加入分類排序功能)

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
 if (method === 'DELETE' && id) return await deleteProduct(context, id);
 break;
 case 'categories':
 if (method === 'POST') return await createOrUpdateCategory(db, await request.json());
 if (method === 'DELETE' && id) return await deleteCategory(db, id);
 break;
 // 【新增】處理分類排序的全新 API 端點
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

// 【修改】查詢 categories 時，加入 sortOrder 排序
async function getAllData(db) { 
 const productsQuery = db.prepare("SELECT * FROM products ORDER BY updatedAt DESC");
 // 當我們查詢所有分類時，必須先按父子關係排，再按我們設定的 sortOrder 排
 const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY parentId, sortOrder ASC");

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

async function createOrUpdateProduct(db, product) { 
 const { id, name, ean13, price, description, imageUrls, imageSize, categoryId } = product;
 const finalSku = (product.sku === '' || product.sku === undefined) ? null : product.sku;
 const imageUrlsJson = JSON.stringify(imageUrls || []);
 const now = new Date().toISOString();
 let results;

 if (id) {
 ({ results } = await db.prepare(
 `UPDATE products SET sku = ?, name = ?, ean13 = ?, price = ?, description = ?, imageUrls = ?, imageSize = ?, categoryId = ?, updatedAt = ? WHERE id = ? RETURNING *`
 ).bind(finalSku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId, now, id).run());
 } else {
 ({ results } = await db.prepare(
 `INSERT INTO products (sku, name, ean13, price, description, imageUrls, imageSize, categoryId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
 ).bind(finalSku, name, ean13, price, description, imageUrlsJson, imageSize, categoryId, now, now).run());
 }

 if (!results || results.length === 0) throw new Error("資料庫操作失敗，未返回任何結果。");
 const finalProduct = { ...results[0], imageUrls: JSON.parse(results[0].imageUrls) };
 return response(finalProduct, id ? 200 : 201);
}

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
 if (imageUrls && imageUrls.length > 0) {
 const keysToDelete = imageUrls.map(url => { if (url.startsWith(R2_PUBLIC_URL)) { return url.substring(R2_PUBLIC_URL.length + 1); } return null; }).filter(key => key);
 if (keysToDelete.length > 0) { await IMAGE_BUCKET.delete(keysToDelete); }
 }
 return response({ message: '產品及其相關圖片已成功刪除' });
}

// 【修改】升級此函式，使其在「新增」時能自動計算 sortOrder
async function createOrUpdateCategory(db, category) { 
 const { id, name, parentId = null } = category;
 const now = new Date().toISOString();
 let results;

 if (id) {
 // 更新模式：只更新名稱、父節點和時間戳，不主動修改 sortOrder
 // sortOrder 只由 reorder API 控制
 ({ results } = await db.prepare(
 "UPDATE categories SET name = ?, parentId = ?, updatedAt = ? WHERE id = ? RETURNING *"
 ).bind(name, parentId, now, id).run());
 } else {
 // 新增模式：自動計算新的 sortOrder
 // 1. 查找當前層級最大的 sortOrder
 const { maxOrder } = await db.prepare(
 "SELECT MAX(sortOrder) as maxOrder FROM categories WHERE parentId IS ?"
 ).bind(parentId).first();
 
 // 2. 新的 sortOrder 是最大值+1。如果該層級沒有分類，maxOrder 會是 null，所以 (null ?? -1) + 1 = 0
 const newSortOrder = (maxOrder ?? -1) + 1;

 // 3. 插入新資料
 ({ results } = await db.prepare(
 "INSERT INTO categories (name, parentId, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?) RETURNING *"
 ).bind(name, parentId, newSortOrder, now, now).run());
 }

 if (!results || results.length === 0) throw new Error("分類操作失敗，未返回任何結果。");
 return response(results[0], id ? 200 : 201);
}

// 【新增】處理分類拖曳排序的核心函式
async function handleCategoryReorder(db, reorderData) {
 // 檢查傳入的資料是否為一個有效的陣列
 if (!reorderData || !Array.isArray(reorderData) || reorderData.length === 0) {
 return response({ error: '無效或空的排序資料' }, 400);
 }
 
 const statements = reorderData.map(cat => 
 db.prepare("UPDATE categories SET parentId = ?, sortOrder = ?, updatedAt = ? WHERE id = ?")
 .bind(cat.parentId, cat.sortOrder, new Date().toISOString(), cat.id)
 );
 
 // 使用 D1 的 batch 功能，確保所有更新是一個原子操作（要嘛全部成功，要嘛全部失敗）
 await db.batch(statements);
 
 return response({ success: true, message: `成功更新 ${reorderData.length} 個分類的順序。` });
}


async function deleteCategory(db, id) { 
 const { count } = await db.prepare("SELECT count(*) as count FROM categories WHERE parentId = ?").bind(id).first();
 if (count > 0) return response({ error: '無法刪除！請先刪除其所有子分類。' }, 400);
 const { product_count } = await db.prepare("SELECT count(*) as product_count FROM products WHERE categoryId = ?").bind(id).first();
 if (product_count > 0) return response({ error: '無法刪除！尚有產品使用此分類。' }, 400);
 // 【注意】我們這裡沒有做刪除後重新排序，因為這會增加複雜性且非必要。
 // 順序中的「空洞」會在下次拖曳排序時自動被填補。
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
 // 【修改】查詢時也加入排序，確保拿到的分類是正確的順序
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
 // 這裡也受益於上面 createOrUpdateCategory 的修改，不過為了批次處理的獨立性，我們在此重複邏輯
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
 productStatements.push(
 db.prepare(
 `INSERT INTO products (sku, name, price, ean13, description, imageUrls, categoryId, imageSize, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
 ).bind(
 p.sku || null, p.name, parseFloat(p.price) || 0, p.ean13 || null, 
 p.description || '', JSON.stringify(p.imageUrls || []), 
 categoryId, 90, nowForProducts, nowForProducts
 )
 );
 }
 
 if (productStatements.length > 0) await db.batch(productStatements);
 
 return response({ success: true, message: `成功匯入 ${newProducts.length} 筆產品。` });
}