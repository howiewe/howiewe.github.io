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
            case 'og-image': {
                const urlObj = new URL(request.url);
                let rawImageUrl = urlObj.searchParams.get('url') || '';
                let imageSize = parseInt(urlObj.searchParams.get('size'), 10) || 90;

                if (id) {
                    const product = await db.prepare("SELECT imageUrls FROM products WHERE id = ?").bind(id).first();
                    if (product && product.imageUrls) {
                        try {
                            const parsed = JSON.parse(product.imageUrls);
                            if (parsed.length > 0) {
                                rawImageUrl = parsed[0].url || '';
                                imageSize = parsed[0].size || 90;
                            }
                        } catch (e) { }
                    }
                }

                if (!rawImageUrl) {
                    return new Response('Image not found', { status: 404 });
                }

                // 依 size 縮放比例計算短邊尺寸與居中位置 (標準 1200 x 630 OG 畫布)
                const scale = Math.max(0.1, Math.min(imageSize / 100, 1.0));
                const boxSize = Math.round(630 * scale);
                const x = Math.round((1200 - boxSize) / 2);
                const y = Math.round((630 - boxSize) / 2);

                const safeUrl = rawImageUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff" />
  <image href="${safeUrl}" x="${x}" y="${y}" width="${boxSize}" height="${boxSize}" preserveAspectRatio="xMidYMid meet" />
</svg>`;

                return new Response(svg, {
                    headers: {
                        'Content-Type': 'image/svg+xml; charset=utf-8',
                        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        }
        return jsonResponse({ error: `無效的公開 API 路徑: /public/${pathSegments.join('/')}` }, 404);
    } catch (e) {
        console.error("Public API Error:", e);
        return jsonResponse({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}