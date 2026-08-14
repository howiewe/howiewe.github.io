// functions/api/[[path]].js
import { jsonResponse } from '../_lib/utils.js';
import { handleImageUpload } from '../_lib/r2.js';
import {
    getCategoriesOnly,
    getPaginatedProducts,
    getProductById,
    createOrUpdateProduct,
    deleteProduct,
    createOrUpdateCategory,
    deleteCategory,
    handleCategoryReorder,
    handleBatchCreateV2
} from '../_lib/db.js';

export async function onRequest(context) {
    const { request, env } = context;
    if (!env.D1_DB || !env.IMAGE_BUCKET || !env.R2_PUBLIC_URL) {
        return jsonResponse({ error: '後端環境變數未正確設定' }, 500);
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
                if (method === 'GET') {
                    if (id) {
                        return await getProductById(db, id);
                    } else {
                        return await getPaginatedProducts(db, url.searchParams);
                    }
                }
                if (method === 'POST') return await createOrUpdateProduct(context, await request.json());
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
        return jsonResponse({ error: `無效的 API 路徑或方法: ${url.pathname}` }, 404);
    } catch (e) {
        console.error("API Error:", e, "Request:", { method, url: request.url });
        return jsonResponse({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}