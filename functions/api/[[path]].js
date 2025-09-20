// functions/api/[[path]].js

// 統一的 API 響應格式
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

// 處理 GET 請求，用於獲取所有資料
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

// 處理 POST 請求，用於儲存所有資料
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

// 處理 PUT 請求，用於上傳圖片
async function handlePut(context) {
    const { IMAGE_BUCKET } = context.env;
    const { request } = context;

    // 從 URL 取得檔名，例如 /api/upload/my-image.jpg
    const url = new URL(request.url);
    const objectName = url.pathname.split('/').pop();

    if (!objectName) {
        return response({ error: '缺少檔名' }, 400);
    }

    try {
        const { readable, writable } = new TransformStream();
        request.body.pipeTo(writable);

        const object = await IMAGE_BUCKET.put(objectName, readable, {
            httpMetadata: { contentType: request.headers.get('content-type') },
        });

        // 重要的！R2 的 public URL 是 r2.dev 的網址，不是 object.key
        const publicUrl = `${context.env.R2_PUBLIC_URL}/${object.key}`;

        return response({
            message: '上傳成功',
            url: publicUrl, // 回傳公開可訪問的 URL
            key: object.key
        });
    } catch (e) {
        console.error("PUT Error:", e);
        return response({ error: `上傳圖片失敗: ${e.message}` }, 500);
    }
}

// 主處理函式，根據請求方法和路徑分發任務
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/data')) {
        if (request.method === 'GET') {
            return handleGet(context);
        }
        if (request.method === 'POST') {
            return handlePost(context);
        }
    } else if (path.startsWith('/api/upload')) {
        if (request.method === 'PUT') {
            return handlePut(context);
        }
    }

    return response({ error: '無效的 API 路徑或方法' }, 404);
}