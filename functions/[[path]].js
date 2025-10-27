// functions/[[path]].js

/**
 * 根據傳入的資料，產生一組 Open Graph (OG) meta 標籤的 HTML 字串。
 * @param {object} data - 包含 title, description, image, url 的物件。
 * @returns {string} - HTML 字串。
 */
function generateMetaTagsHTML(data) {
    // 進行簡單的 HTML 轉義，防止內容中的引號破壞標籤結構
    const escape = (str) => str.replace(/"/g, '&quot;');

    return `
        <meta property="og:title" content="${escape(data.title)}" />
        <meta name="description" content="${escape(data.description.substring(0, 160))}" />
        <meta property="og:description" content="${escape(data.description.substring(0, 160))}" />
        <meta property="og:image" content="${data.image}" />
        <meta property="og:url" content="${data.url}" />
        <meta property="og:type" content="website" />
    `;
}

/**
 * 這是 Cloudflare HTMLRewriter 的處理器類別。
 * 它會在找到 <head> 標籤時，將我們產生的 meta 標籤附加進去。
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
 * 這是另一個 HTMLRewriter 處理器。
 * 它會找到 <title> 標籤，並將其內容替換成我們動態產生的標題。
 */
class TitleRewriter {
    constructor(title) {
        this.title = title;
    }

    text(text) {
        if (this.title) {
            text.replace(this.title);
        }
    }
}

export async function onRequest(context) {
    const { request, env } = context;

    // 安全性檢查：確保 D1 資料庫已繫結
    if (!env.D1_DB) {
        return new Response("後端資料庫未設定。", { status: 500 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // --- 1. 設定預設的 Meta 標籤內容 ---
    //    這是分享首頁或找不到資料時的後備內容。
    //    【請務必替換成您自己的預設圖片網址！】
    let metaData = {
        title: '光華工業有限公司 | 產品展示',
        description: '探索光華工業有限公司提供的所有優質產品，涵蓋運動用品、居家生活等領域。',
        image: 'https://your-website.com/assets/default-share-image.png', // <-- 請替換成您的公司 Logo 或主圖 URL
        url: url.href
    };

    // --- 2. 根據網址路徑，查詢資料並更新 Meta 標籤內容 ---
    try {
        if (pathname.startsWith('/product/')) {
            const id = pathname.split('/')[2];
            if (!isNaN(id)) {
                // 查詢特定產品
                const product = await env.D1_DB.prepare(
                    "SELECT name, description, imageUrls FROM products WHERE id = ?"
                ).bind(id).first();

                if (product) {
                    let firstImageUrl = metaData.image; // 預設使用後備圖片
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
                // 查詢特定分類
                const category = await env.D1_DB.prepare(
                    "SELECT name FROM categories WHERE id = ?"
                ).bind(id).first();

                if (category) {
                    metaData = {
                        title: `${category.name} | 光華工業有限公司`,
                        description: `探索我們在「${category.name}」分類下的所有產品。`,
                        image: metaData.image, // 分類頁使用預設圖片
                        url: url.href
                    };
                }
            }
        }
    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
        // 如果資料庫查詢出錯，不中斷流程，而是使用預設的 metaData。
    }


    // --- 3. 獲取原始的 index.html 靜態檔案 ---
    // env.ASSETS.fetch 會從您的專案部署檔案中抓取靜態資源
    // 我們讓它抓取根目錄的檔案，因為所有路徑實際上都應該顯示 index.html 的內容
    const assetUrl = new URL(request.url);
    assetUrl.pathname = '/index.html'; // 強制指向 index.html
    const asset = await env.ASSETS.fetch(new Request(assetUrl));

    // --- 4. 使用 HTMLRewriter 來「手術式」修改 HTML ---
    //    這會在串流回傳給使用者的過程中動態修改，效能極高。
    const rewriter = new HTMLRewriter()
        .on('title', new TitleRewriter(metaData.title))
        .on('head', new HeadRewriter(metaData));

    // --- 5. 回傳被改寫後的 HTML 內容 ---
    return rewriter.transform(asset);
}