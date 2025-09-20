// functions/api/[[path]].js (正確的最終版本)

const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

async function handleGet(context) {
    const { DB } = context.env;
    try {
        const products = await DB.get('products', 'json') || [];
        const categories = await DB.get('categories', 'json') || [];
        return response({ products, categories });
    } catch (e) {
        console.error("GET Error:", e);
        return response({ error: '無法讀取資料庫' }, 500);
    }
}

async function handlePost(context) {
    const { DB } = context.env;
    try {
        const { products, categories } = await context.request.json();
        if (!products || !categories) {
            return response({ error: '缺少產品或分類資料' }, 400);
        }
        await DB.put('products', JSON.stringify(products));
        await DB.put('categories', JSON.stringify(categories));
        return response({ message: '資料儲存成功' });
    } catch (e) {
        console.error("POST Error:", e);
        return response({ error: '寫入資料庫時發生錯誤' }, 500);
    }
}

async function handlePut(context) {
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = context.env;
    const { request } = context;

    const url = new URL(request.url);
    const objectName = url.pathname.split('/').pop();

    if (!objectName) {
        return response({ error: '缺少檔名' }, 400);
    }
    if (!R2_PUBLIC_URL) {
         return response({ error: 'R2_PUBLIC_URL 环境变数未设定' }, 500);
    }
    if (!IMAGE_BUCKET) {
         return response({ error: 'IMAGE_BUCKET 绑定未设定' }, 500);
    }

    try {
        // 【兼容性修正】将 TransformStream 的写法改回直接使用 request.body
        // 老版本 Worker 可能对 TransformStream 支持不佳
        const object = await IMAGE_BUCKET.put(objectName, request.body, {
            httpMetadata: { contentType: request.headers.get('content-type') },
        });

        const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;

        return response({
            message: '上傳成功',
            url: publicUrl,
            key: object.key
        });
    } catch (e) {
        console.error("PUT Error Details:", JSON.stringify(e, null, 2)); 
        return response({ error: `上傳圖片失敗: ${e.message}` }, 500);
    }
}

export async function onRequest(context) {
    // ... (此函数保持不变) ...
    const { request } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/data')) {
        if (request.method === 'GET') return handleGet(context);
        if (request.method === 'POST') return handlePost(context);
    } else if (path.startsWith('/api/upload')) {
        if (request.method === 'PUT') return handlePut(context);
    }

    return response({ error: '無效的 API 路徑或方法' }, 404);
}