// functions/api/[[path]].js (最终纯净版)

import Papa from 'papaparse';

// --- 统一的 API 响应格式 ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

// --- API 业务逻辑处理函数 ---

// GET /api/data - 获取所有产品和分类
async function handleGet(context) {
    const { DB } = context.env;
    try {
        const products = await DB.get('products', 'json') || [];
        const categories = await DB.get('categories', 'json') || [];
        return response({ products, categories });
    } catch (e) {
        console.error("GET /api/data Error:", e);
        return response({ error: '无法从资料库读取资料' }, 500);
    }
}

// POST /api/data - (用于单笔编辑) 储存所有产品和分类
async function handlePost(context) {
    const { request, env } = context;
    const { DB } = env;
    try {
        const { products, categories } = await request.json();
        await DB.put('products', JSON.stringify(products));
        await DB.put('categories', JSON.stringify(categories));
        return response({ message: '资料储存成功' });
    } catch (e) {
        console.error("POST /api/data Error:", e);
        return response({ error: '写入资料库时发生错误' }, 500);
    }
}

// PUT /api/upload/:fileName - 上传单个图片
async function handlePut(context) {
    const { request, env } = context;
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    const url = new URL(request.url);
    const objectName = url.pathname.split('/').pop();

    if (!objectName) return response({ error: '缺少檔名' }, 400);
    if (!R2_PUBLIC_URL) return response({ error: 'R2_PUBLIC_URL 环境变数未设定' }, 500);
    if (!IMAGE_BUCKET) return response({ error: 'IMAGE_BUCKET 绑定未设定' }, 500);

    try {
        const object = await IMAGE_BUCKET.put(objectName, request.body, {
            httpMetadata: { contentType: request.headers.get('content-type') },
        });
        const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
        return response({ message: '上傳成功', url: publicUrl, key: object.key });
    } catch (e) {
        console.error("PUT /api/upload Error:", e);
        return response({ error: `上傳圖片失敗: ${e.message}` }, 500);
    }
}

// POST /api/batch-create - 批次建立产品
async function handleBatchCreate(context) {
    const { request, env } = context;
    const { DB } = env;
    try {
        const { products: newProducts } = await request.json();
        if (!newProducts || !Array.isArray(newProducts)) {
            return response({ error: '无效的产品资料格式' }, 400);
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

        return response({ success: true, message: `成功汇入 ${newProducts.length} 笔产品` });
    } catch (e) {
        console.error('POST /api/batch-create Error:', e);
        return response({ error: '批次建立产品时发生错误', details: e.message }, 500);
    }
}

// --- 主路由函式 (The Router) ---
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