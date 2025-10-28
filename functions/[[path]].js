// functions/[[path]].js (修正版 v3 - 整合路由與 SEO)

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
        return next(); // 如果沒有 D1 設定，直接交給下一步
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 我們只攔截看起來像 HTML 頁面的請求，放行 API 和靜態資源
    const isAsset = pathname.slice(1).includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/public/');
    if (isAsset) {
        return next(); // 交給 Pages 預設的靜態資源服務
    }

    let metaData = null;
    let baseHtmlPath = null; // 決定要回傳哪個 HTML 檔案

    try {
        // --- 核心路由判斷 ---

        // 情況 1: 請求的是產品目錄 SPA 相關的路徑 (/catalog, /catalog/product/...)
        if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html'; // SPA 的基礎檔案是 catalog.html
            
            // 接下來，根據具體路徑抓取 Meta Data
            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3]; // /catalog/product/ID -> 陣列索引是 3
                if (!isNaN(id)) {
                    const product = await env.D1_DB.prepare("SELECT name, description, imageUrls FROM products WHERE id = ?").bind(id).first();
                    if (product) {
                        let firstImageUrl = 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public';
                        if (product.imageUrls) { try { const images = JSON.parse(product.imageUrls); if (images && images.length > 0 && images[0].url) { firstImageUrl = images[0].url; } } catch (e) {} }
                        metaData = { title: `${product.name} | 光華工業有限公司`, description: product.description || '查看產品詳細資訊', image: firstImageUrl, url: url.href };
                    }
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const id = pathname.split('/')[3]; // /catalog/category/ID
                if (!isNaN(id)) {
                    const category = await env.D1_DB.prepare("SELECT name FROM categories WHERE id = ?").bind(id).first();
                    if (category) {
                        // (這裡的查詢邏輯保持不變)
                        metaData = { title: `${category.name} | 光華工業有限公司`, description: `探索我們在「${category.name}」分類下的所有產品。`, image: '...', url: url.href };
                    }
                }
            }
            
            // 如果只是 /catalog 首頁，設定預設的目錄 Meta
            if (!metaData) {
                metaData = { title: '產品目錄 | 光華工業有限公司', description: '瀏覽光華工業所有的產品系列。', image: '...', url: url.href };
            }

        // 情況 2: 請求的是網站根目錄 (新的首頁)
        } else if (pathname === '/') {
            baseHtmlPath = '/index.html'; // 首頁的基礎檔案是 index.html
            metaData = {
                title: '光華工業有限公司 - 專業運動用品製造商',
                description: '光華工業擁有超過50年專業製造經驗，提供高品質乒乓球拍、羽球拍、跳繩、球棒等各式運動用品。',
                image: 'https://images.unsplash.com/photo-1543351368-0414336065e9?q=80&w=2070&auto-format&fit=crop',
                url: url.href
            };
        }

    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
        // 即使資料庫查詢失敗，我們還是要嘗試回傳頁面
    }

    // 如果我們的路由邏輯沒有匹配到任何情況，就交給預設服務
    if (!baseHtmlPath) {
        return next();
    }

    // 根據 `baseHtmlPath` 取得對應的 HTML 檔案內容
    const assetResponse = await env.ASSETS.fetch(new URL(baseHtmlPath, request.url));

    // 建立一個可修改的回應
    const mutableResponse = new Response(assetResponse.body, assetResponse);
    mutableResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    mutableResponse.headers.set('Pragma', 'no-cache');
    mutableResponse.headers.set('Expires', '0');

    // 如果有成功取得 metaData，就使用 HTMLRewriter 注入
    if (metaData) {
        return new HTMLRewriter()
            .on('title', new TitleRewriter(metaData.title))
            .on('head', new HeadRewriter(metaData))
            .transform(mutableResponse);
    }

    // 如果沒有 metaData (例如資料庫出錯)，也回傳帶有正確快取標頭的頁面
    return mutableResponse;
}