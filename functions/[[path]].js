// --- Meta 標籤與 Rewriter 輔助函式 (保持不變) ---
function generateMetaTagsHTML(data) {
    const escape = (str) => str ? str.replace(/"/g, '&quot;') : '';
    const description = (data.description || '').substring(0, 160);
    return `
        <meta property="og:title" content="${escape(data.title)}" />
        <meta name="description" content="${escape(description)}" />
        <meta property="og:description" content="${escape(description)}" />
        <meta property="og:image" content="${data.image || ''}" />
        <meta property="og:url" content="${data.url || ''}" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image">
    `;
}
class HeadRewriter {
    constructor(metaData) { this.metaData = metaData; }
    element(element) {
        if (this.metaData) {
            element.append(generateMetaTagsHTML(this.metaData), { html: true });
        }
    }
}
class TitleRewriter {
    constructor(title) { this.title = title; }
    element(element) {
        if (this.title) { element.setInnerContent(this.title); }
    }
}

// --- 主要請求處理函式 ---
export async function onRequest(context) {
    const { request, env, next } = context;

    if (!env.D1_DB) {
        return next();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    const isAsset = pathname.slice(1).includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/public/');
    if (isAsset) {
        return next();
    }

    let metaData = null;
    let baseHtmlPath = null;
    const defaultImage = 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public';

    try {
        if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';
            
            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                if (!isNaN(id)) {
                    const product = await env.D1_DB.prepare("SELECT name, description, imageUrls FROM products WHERE id = ?").bind(id).first();
                    if (product) {
                        let firstImageUrl = defaultImage;
                        if (product.imageUrls) { try { const images = JSON.parse(product.imageUrls); if (images && images.length > 0 && images[0].url) { firstImageUrl = images[0].url; } } catch (e) {} }
                        metaData = { title: `${product.name} | 光華工業有限公司`, description: product.description || '查看產品詳細資訊', image: firstImageUrl, url: url.href };
                    }
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const id = pathname.split('/')[3];
                if (!isNaN(id)) {
                    const category = await env.D1_DB.prepare("SELECT name FROM categories WHERE id = ?").bind(id).first();
                    if (category) {
                        // ▼▼▼ 【核心修正】恢復查詢分類代表圖的資料庫邏輯 ▼▼▼
                        const randomProductImage = await env.D1_DB.prepare(`
                            SELECT p.imageUrls FROM products p
                            WHERE p.categoryId IN (
                                WITH RECURSIVE descendant_categories(id) AS (
                                    SELECT id FROM categories WHERE id = ?
                                    UNION ALL
                                    SELECT c.id FROM categories c JOIN descendant_categories dc ON c.parentId = dc.id
                                )
                                SELECT id FROM descendant_categories
                            )
                            AND p.imageUrls IS NOT NULL AND p.imageUrls != '[]' 
                            ORDER BY RANDOM() LIMIT 1
                        `).bind(id).first();

                        let categoryImage = defaultImage;
                        if (randomProductImage && randomProductImage.imageUrls) {
                            try {
                                const images = JSON.parse(randomProductImage.imageUrls);
                                if (images && images.length > 0 && images[0].url) {
                                    categoryImage = images[0].url;
                                }
                            } catch (e) { /* 忽略錯誤 */ }
                        }
                        metaData = {
                            title: `${category.name} | 光華工業有限公司`,
                            description: `探索我們在「${category.name}」分類下的所有產品。`,
                            image: categoryImage,
                            url: url.href
                        };
                        // ▲▲▲ 【修正結束】 ▲▲▲
                    }
                }
            }
            
            if (!metaData) {
                metaData = { title: '產品目錄 | 光華工業有限公司', description: '瀏覽光華工業所有的產品系列。', image: defaultImage, url: url.href };
            }

        } else if (pathname === '/') {
            baseHtmlPath = '/index.html';
            metaData = {
                title: '光華工業有限公司 - 專業運動用品製造商',
                description: '光華工業擁有超過50年專業製造經驗，提供高品質乒乓球拍、羽球拍、跳繩、球棒等各式運動用品。',
                image: 'https://images.unsplash.com/photo-1543351368-0414336065e9?q=80&w=2070&auto-format&fit=crop',
                url: url.href
            };
        }

    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
    }

    if (!baseHtmlPath) {
        return next();
    }

    const assetResponse = await env.ASSETS.fetch(new URL(baseHtmlPath, request.url));
    const mutableResponse = new Response(assetResponse.body, assetResponse);
    mutableResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    mutableResponse.headers.set('Pragma', 'no-cache');
    mutableResponse.headers.set('Expires', '0');

    if (metaData) {
        return new HTMLRewriter()
            .on('title', new TitleRewriter(metaData.title))
            .on('head', new HeadRewriter(metaData))
            .transform(mutableResponse);
    }

    return mutableResponse;
}