// functions/[[path]].js (修正版 v2 - 使用 context.next())

/**
 * 根據傳入的資料，產生一組 Open Graph (OG) meta 標籤的 HTML 字串。
 * @param {object} data - 包含 title, description, image, url 的物件。
 * @returns {string} - HTML 字串。
 */
function generateMetaTagsHTML(data) {
    // 進行簡單的 HTML 轉義，防止內容中的引號破壞標籤結構
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

/**
 * HTMLRewriter 處理器類別，用於在 <head> 標籤中附加 meta 標籤。
 */
class HeadRewriter {
    constructor(metaData) {
        this.metaData = metaData;
    }

    element(element) {
        if (this.metaData) {
            const tagsHtml = generateMetaTagsHTML(this.metaData);
            element.append(tagsHtml, { html: true });
        }
    }
}

/**
 * HTMLRewriter 處理器類別，用於替換 <title> 標籤的內容。
 */
class TitleRewriter {
    constructor(title) {
        this.title = title;
    }

    element(element) {
        if (this.title) {
            element.setInnerContent(this.title);
        }
    }
}


export async function onRequest(context) {
    const { request, env, next } = context; // <-- 取得 next 函數

    // 安全性檢查：確保 D1 資料庫已繫結
    if (!env.D1_DB) {
        return new Response("後端資料庫未設定。", { status: 500 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // --- 1. 設定預設的 Meta 標籤內容 ---
    //    【請務必替換成您自己的預設圖片網址！】
    let metaData = {
        title: '光華工業有限公司 | 產品展示',
        description: '探索光華工業有限公司提供的所有優質產品，涵蓋運動用品、居家生活等領域。',
        image: 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public', // <-- 這是範例圖片，請務必替換成您自己的
        url: url.href
    };

    // --- 2. 根據網址路徑，查詢資料並更新 Meta 標籤內容 ---
    try {
        // 排除靜態資源和 API 路徑，避免不必要的資料庫查詢
        if (!pathname.startsWith('/api/') && !pathname.startsWith('/public/') && !pathname.includes('.')) {
             if (pathname.startsWith('/product/')) {
                const id = pathname.split('/')[2];
                if (!isNaN(id)) {
                    const product = await env.D1_DB.prepare("SELECT name, description, imageUrls FROM products WHERE id = ?").bind(id).first();
                    if (product) {
                        let firstImageUrl = metaData.image;
                        if (product.imageUrls) {
                            try {
                                const images = JSON.parse(product.imageUrls);
                                if (images && images.length > 0 && images[0].url) {
                                    firstImageUrl = images[0].url;
                                }
                            } catch (e) { /* 解析失敗則忽略 */ }
                        }
                        metaData = {
                            title: `${product.name} | 光華工業有限公司`,
                            description: product.description || '查看產品詳細資訊',
                            image: firstImageUrl,
                            url: url.href
                        };
                    }
                }
            } else if (pathname.startsWith('/category/')) {
                const id = pathname.split('/')[2];
                if (!isNaN(id)) {
                    const category = await env.D1_DB.prepare("SELECT name FROM categories WHERE id = ?").bind(id).first();
                    if (category) {
                        metaData = {
                            title: `${category.name} | 光華工業有限公司`,
                            description: `探索我們在「${category.name}」分類下的所有產品。`,
                            image: metaData.image,
                            url: url.href
                        };
                    }
                }
            }
        }
    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
    }
    
    // 【核心修正】呼叫 context.next() 來獲取 Cloudflare Pages 正常應提供的靜態頁面 (即 index.html)
    const response = await next();

    // 只對 HTML 頁面進行改寫
    if (response.headers.get("Content-Type")?.startsWith("text/html")) {
        // 使用 HTMLRewriter 來「手術式」修改 HTML
        return new HTMLRewriter()
            .on('title', new TitleRewriter(metaData.title))
            .on('head', new HeadRewriter(metaData))
            .transform(response);
    }

    // 如果不是 HTML (例如 CSS, JS 檔案)，直接回傳原始回應
    return response;
}