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
    const { request, env, next } = context;

    if (!env.D1_DB) {
        return new Response("後端資料庫未設定。", { status: 500 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    let metaData = {
        title: '光華工業有限公司 | 產品展示',
        description: '探索光華工業有限公司提供的所有優質產品，涵蓋運動用品等領域。',
        image: 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public',
        url: url.href
    };

    try {
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
                            } catch (e) { /* 忽略錯誤 */ }
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

                        let categoryImage = metaData.image;
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
                    }
                }
            }
        }
    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
    }

    // 取得原始的、由 Pages 服務的靜態頁面回應
    const originalResponse = await next();

    // 只對 HTML 頁面進行操作
    if (originalResponse.headers.get("Content-Type")?.startsWith("text/html")) {
        // 【核心修正】
        // 步驟 1: 建立一個原始回應的複本。這樣我們就有了一個可以安全修改標頭的物件。
        //         重要的是，`originalResponse.body` 這個串流也被完整地複製過來了。
        const mutableResponse = new Response(originalResponse.body, originalResponse);

        // 步驟 2: 在這個可修改的複本上，設定我們需要的快取控制標頭。
        mutableResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        mutableResponse.headers.set('Pragma', 'no-cache');
        mutableResponse.headers.set('Expires', '0');

        // 步驟 3: 最後，讓 HTMLRewriter 在這個已經帶有正確標頭的複本上進行內容轉換。
        //         這樣返回的最終結果，既有修改過的標頭，也有修改過的 HTML 內容，
        //         並且串流是完整的。
        return new HTMLRewriter()
            .on('title', new TitleRewriter(metaData.title))
            .on('head', new HeadRewriter(metaData))
            .transform(mutableResponse);
    }

    // 如果不是 HTML 檔案 (例如 CSS, JS)，直接回傳原始回應，不做任何修改。
    return originalResponse;
}
