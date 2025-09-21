// functions/api/[[path]].js (最終清理版)

import Papa from 'papaparse';

// --- 統一的 API 響應格式 ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

// --- API 處理函式 ---

async function handleGet(context) {
    const { DB } = context.env;
    try {
        const products = await DB.get('products', 'json') || [];
        const categories = await DB.get('categories', 'json') || [];
        return response({ products, categories });
    } catch (e) {
        return response({ error: '無法讀取資料庫' }, 500);
    }
}

async function handlePost(context) {
    const { DB } = context.env;
    try {
        const { products, categories } = await request.json();
        await DB.put('products', JSON.stringify(products));
        await DB.put('categories', JSON.stringify(categories));
        return response({ message: '資料儲存成功' });
    } catch (e) {
        return response({ error: '寫入資料庫時發生錯誤' }, 500);
    }
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

async function handleBatchCreate(context) {
    const { request, env } = context;
    const { DB } = env;

    try {
        const { products: newProducts } = await request.json();
        if (!newProducts || !Array.isArray(newProducts)) {
            return response({ error: '無效的產品資料格式' }, 400);
        }

        let allProducts = await DB.get('products', 'json') || [];
        let allCategories = await DB.get('categories', 'json') || [];
        const categoryNameMap = new Map(allCategories.map(c => [c.name, c]));

        newProducts.forEach((productData, index) => {
            const categoryName = (productData.category || '未分類').trim();
            let categoryId;

            if (categoryNameMap.has(categoryName)) {
                categoryId = categoryNameMap.get(categoryName).id;
            } else {
                const newCategory = { id: Date.now() + index, name: categoryName, parentId: null };
                allCategories.push(newCategory);
                categoryNameMap.set(newCategory.name, newCategory);
                categoryId = newCategory.id;
            }

            const finalProduct = {
                id: Date.now() + index,
                sku: productData.sku || `SKU-${Date.now() + index}`,
                name: productData.name || '未命名产品',
                price: parseFloat(productData.price) || 0,
                description: productData.description || '',
                categoryId: categoryId,
                imageUrls: productData.imageUrls || [],
                ean13: productData.ean13 || '',
                imageSize: 90,
            };
            allProducts.push(finalProduct);
        });

        await DB.put('products', JSON.stringify(allProducts));
        await DB.put('categories', JSON.stringify(allCategories));

        return response({ success: true, message: `成功匯入 ${newProducts.length} 筆產品` });
    } catch (e) {
        console.error('Batch Create Error:', e);
        return response({ error: '批次建立產品時發生錯誤', details: e.message }, 500);
    }
}

// --- 主處理函式 (統一路由) ---
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.startsWith('/api/data')) {
        if (method === 'GET') return handleGet(context);
        if (method === 'POST') return handlePost(context);
    }
    else if (path.startsWith('/api/upload')) {
        if (method === 'PUT') return handlePut(context);
    }
    else if (path === '/api/batch-create' && method === 'POST') {
        return handleBatchCreate(context);
    }

    return response({ error: '無效的 API 路徑或方法' }, 404);
}