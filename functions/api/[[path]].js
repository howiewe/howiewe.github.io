// functions/api/[[path]].js (CSV 批次匯入功能升級版)

import Papa from 'papaparse'; // 導入我們剛剛安裝的 CSV 解析庫

// --- 統一的 API 響應格式 (保持不變) ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
});


// --- 核心匯入邏輯 ---
async function handleCsvImport(context) {
    const { request, env } = context;
    const { DB, IMAGE_BUCKET, R2_PUBLIC_URL } = env;

    try {
        const formData = await request.formData();
        const file = formData.get('csvFile');

        if (!file) {
            return response({ error: '找不到上傳的 CSV 檔案' }, 400);
        }

        const csvText = await file.text();

        // 使用 PapaParse 解析 CSV
        const parseResult = Papa.parse(csvText, {
            header: true, // 將第一行作為標題 (key)
            skipEmptyLines: true, // 跳過空行
        });

        if (parseResult.errors.length > 0) {
            return response({ error: 'CSV 檔案格式錯誤', details: parseResult.errors }, 400);
        }

        const productsFromCsv = parseResult.data;
        
        // 獲取現有的所有產品和分類，以便比對
        let allProducts = await DB.get('products', 'json') || [];
        let allCategories = await DB.get('categories', 'json') || [];
        const productSkuMap = new Map(allProducts.map(p => [p.sku, p]));
        const categoryNameMap = new Map(allCategories.map(c => [c.name, c]));

        const report = {
            totalRows: productsFromCsv.length,
            successAdded: 0,
            successUpdated: 0,
            failed: 0,
            errors: []
        };
        
        // 處理每一行 CSV 資料
        for (const [index, productData] of productsFromCsv.entries()) {
            const rowNum = index + 2; // CSV 行號 (包含標題行)

            // 驗證基本欄位
            if (!productData.sku || !productData.name || !productData.price || !productData.category) {
                report.failed++;
                report.errors.push(`第 ${rowNum} 行: 缺少必要的欄位 (sku, name, price, category)`);
                continue;
            }
            
            try {
                // 處理分類
                let categoryId;
                if (categoryNameMap.has(productData.category)) {
                    categoryId = categoryNameMap.get(productData.category).id;
                } else {
                    // 自動建立新分類
                    const newCategory = { id: Date.now() + index, name: productData.category.trim(), parentId: null };
                    allCategories.push(newCategory);
                    categoryNameMap.set(newCategory.name, newCategory);
                    categoryId = newCategory.id;
                }

                // 處理圖片
                const imageUrlsToProcess = (productData.imageUrls || '').split(',').map(url => url.trim()).filter(url => url);
                const finalImageUrls = [];
                for (const imageUrl of imageUrlsToProcess) {
                    try {
                        const imageResponse = await fetch(imageUrl);
                        if (!imageResponse.ok) throw new Error(`無法抓取圖片 ${imageUrl}`);
                        
                        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
                        const fileExtension = contentType.split('/')[1] || 'jpg';
                        const fileName = `product-${productData.sku}-${Date.now()}.${fileExtension}`;
                        
                        await IMAGE_BUCKET.put(fileName, imageResponse.body, {
                            httpMetadata: { contentType },
                        });
                        finalImageUrls.push(`${R2_PUBLIC_URL}/${fileName}`);

                    } catch (imgErr) {
                         // 如果單張圖片抓取失敗，只記錄錯誤，不中斷整個產品的匯入
                        report.errors.push(`第 ${rowNum} 行 (SKU: ${productData.sku}): 圖片 ${imageUrl} 處理失敗: ${imgErr.message}`);
                    }
                }
                
                // 組合產品物件
                const productObject = {
                    name: productData.name,
                    sku: productData.sku,
                    price: parseFloat(productData.price),
                    description: productData.description || '',
                    categoryId: categoryId,
                    imageUrls: finalImageUrls,
                    ean13: productData.ean13 || '',
                    imageSize: 90, // 批次匯入的預設為 90
                };

                // 判斷是新增還是更新
                if (productSkuMap.has(productData.sku)) {
                    // 更新
                    const existingProduct = productSkuMap.get(productData.sku);
                    productObject.id = existingProduct.id;
                    const productIndex = allProducts.findIndex(p => p.id === existingProduct.id);
                    allProducts[productIndex] = productObject;
                    report.successUpdated++;
                } else {
                    // 新增
                    productObject.id = Date.now() + index;
                    allProducts.push(productObject);
                    report.successAdded++;
                }
                productSkuMap.set(productObject.sku, productObject); // 更新 map

            } catch (procErr) {
                report.failed++;
                report.errors.push(`第 ${rowNum} 行 (SKU: ${productData.sku}): 處理失敗: ${procErr.message}`);
            }
        }
        
        // 將更新後的所有資料存回 KV
        await DB.put('products', JSON.stringify(allProducts));
        await DB.put('categories', JSON.stringify(allCategories));

        return response(report);

    } catch (e) {
        console.error("CSV Import Error:", e);
        return response({ error: '匯入過程中發生嚴重錯誤', details: e.message }, 500);
    }
}

// --- 匯出 CSV 邏輯 ---
async function handleCsvExport(context) {
    const { DB } = context.env;
    try {
        const products = await DB.get('products', 'json') || [];
        const categories = await DB.get('categories', 'json') || [];
        const categoryIdMap = new Map(categories.map(c => [c.id, c.name]));
        
        const dataForCsv = products.map(p => ({
            sku: p.sku || '',
            name: p.name || '',
            price: p.price || 0,
            description: p.description || '',
            category: categoryIdMap.get(p.categoryId) || '未分類',
            imageUrls: (p.imageUrls || []).join(','),
            ean13: p.ean13 || ''
        }));
        
        const csvString = Papa.unparse(dataForCsv);
        const BOM = '\uFEFF'; // 加入 BOM 來修復 Excel 亂碼問題
        
        return new Response(BOM + csvString, {
            headers: {
                'Content-Type': 'text/csv;charset=utf-8-sig',
                'Content-Disposition': 'attachment; filename="products.csv"'
            }
        });
    } catch (e) {
        console.error("CSV Export Error:", e);
        return response({ error: '匯出失敗', details: e.message }, 500);
    }
}


// --- 主處理函式，路由 (Router) ---
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 現有的資料 API (保持不變)
    if (path.startsWith('/api/data')) {
        if (method === 'GET') return await context.env.DB.get('products_and_categories_view'); /* handleGet(context); */
        if (method === 'POST') return await context.env.DB.put('products_and_categories_view', request.body); /* handlePost(context); */
    } 
    // 現有的圖片上傳 API (保持不變)
    else if (path.startsWith('/api/upload')) {
        if (method === 'PUT') return handlePut(context);
    } 
    // 【新增】CSV 匯入 API
    else if (path === '/api/import/csv' && method === 'POST') {
        return handleCsvImport(context);
    }
    // 【新增】CSV 匯出 API
    else if (path === '/api/export/csv' && method === 'GET') {
        return handleCsvExport(context);
    }

    return response({ error: '無效的 API 路徑或方法' }, 404);
}

// --- 其他舊函式 (handleGet, handlePost, handlePut) 保持不變 ---
// 你可以把它們的原版程式碼放在這裡，或者直接刪除，因為上面的路由已經包含了它們
async function handleGet(context) {
    const { DB } = context.env;
    const products = await DB.get('products', 'json') || [];
    const categories = await DB.get('categories', 'json') || [];
    return response({ products, categories });
}

async function handlePost(context) {
    const { DB } = context.env;
    const { products, categories } = await context.request.json();
    await DB.put('products', JSON.stringify(products));
    await DB.put('categories', JSON.stringify(categories));
    return response({ message: '資料儲存成功' });
}

async function handlePut(context) {
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = context.env;
    const { request } = context;
    const url = new URL(request.url);
    const objectName = url.pathname.split('/').pop();
    if (!objectName) return response({ error: '缺少檔名' }, 400);
    if (!R2_PUBLIC_URL) return response({ error: 'R2_PUBLIC_URL 環境變數未設定' }, 500);
    if (!IMAGE_BUCKET) return response({ error: 'IMAGE_BUCKET 綁定未設定' }, 500);
    try {
        const object = await IMAGE_BUCKET.put(objectName, request.body, {
            httpMetadata: { contentType: request.headers.get('content-type') },
        });
        const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
        return response({ message: '上傳成功', url: publicUrl, key: object.key });
    } catch (e) {
        console.error("PUT Error Details:", JSON.stringify(e, null, 2));
        return response({ error: `上傳圖片失敗: ${e.message}` }, 500);
    }
}