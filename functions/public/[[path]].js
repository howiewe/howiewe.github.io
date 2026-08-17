// functions/public/[[path]].js
import { jsonResponse } from '../_lib/utils.js';
import {
    getCategoriesOnly,
    getPaginatedProducts,
    getProductById
} from '../_lib/db.js';

export async function onRequest(context) {
    const { request, env, params } = context;
    if (!env.D1_DB) {
        return jsonResponse({ error: '後端環境變數未正確設定' }, 500);
    }

    const pathSegments = params.path;
    const resource = pathSegments[0];
    const id = pathSegments[1];
    const method = request.method;

    if (method !== 'GET') {
        return jsonResponse({ error: '此路徑為唯讀。' }, 405);
    }

    try {
        const db = env.D1_DB;
        switch (resource) {
            case 'all-data':
                return await getCategoriesOnly(db);
            case 'products':
                if (id) {
                    return await getProductById(db, id);
                } else {
                    const url = new URL(request.url);
                    return await getPaginatedProducts(db, url.searchParams);
                }
        }
        return jsonResponse({ error: `無效的公開 API 路徑: /public/${pathSegments.join('/')}` }, 404);
    } catch (e) {
        console.error("Public API Error:", e);
        return jsonResponse({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}