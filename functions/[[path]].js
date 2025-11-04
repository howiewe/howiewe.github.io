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

class ContentInjector {
    constructor(selector, content) {
        this.selector = selector;
        this.content = content;
    }
    element(element) {
        if (this.content) {
            // 使用 setInnerContent 替換元素的內容
            // { html: true } 允許我們注入 HTML 標籤，例如 <p>
            element.setInnerContent(this.content, { html: true });
        }
    }
}

// --- 主要請求處理函式 ---
// --- 主要請求處理函式 (完整修正版) ---
export async function onRequest(context) {
    const { request, env, next } = context;

    // 確保 D1 綁定存在，否則交給下一個處理程序
    if (!env.D1_DB) {
        return next();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 判斷是否為靜態資源、API 或 Public API 請求，若是則直接跳過 SSR
    const isAsset = pathname.slice(1).includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/public/');
    if (isAsset) {
        return next();
    }

    let metaData = null;
    let baseHtmlPath = null;
    const defaultImage = 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public';

    // 宣告一個陣列，用於儲存所有需要執行的 rewriter 任務
    let rewriters = [];

    try {
        if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';
            let categoryDescriptionHtml = ''; // 用於儲存分類描述的 HTML

            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                if (!isNaN(id)) {
                    const product = await env.D1_DB.prepare("SELECT name, description, imageUrls FROM products WHERE id = ?").bind(id).first();
                    if (product) {
                        let firstImageUrl = defaultImage;
                        if (product.imageUrls) {
                            try {
                                const images = JSON.parse(product.imageUrls);
                                if (images && images.length > 0 && images[0].url) {
                                    firstImageUrl = images[0].url;
                                }
                            } catch (e) {
                                console.error(`解析產品 ${id} 的 imageUrls 失敗:`, e);
                            }
                        }
                        metaData = {
                            title: `${product.name} | 光華工業有限公司`,
                            description: product.description || '查看產品詳細資訊',
                            image: firstImageUrl,
                            url: url.href
                        };
                    }
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const id = pathname.split('/')[3];
                if (!isNaN(id)) {
                    const category = await env.D1_DB.prepare("SELECT name, description FROM categories WHERE id = ?").bind(id).first();
                    if (category) {
                        if (category.description) {
                            const formattedDescription = category.description.replace(/\n/g, '<br>');
                            categoryDescriptionHtml = `<p>${formattedDescription}</p>`;
                        }
                        
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
                            } catch (e) {
                                console.error(`解析分類 ${id} 的代表圖失敗:`, e);
                            }
                        }
                        metaData = {
                            title: `${category.name} | 光華工業有限公司`,
                            description: category.description || `探索我們在「${category.name}」分類下的所有產品。`,
                            image: categoryImage,
                            url: url.href
                        };
                    }
                }
            }

            // 為所有 /catalog/... 路徑設置預設 meta（如果前面沒匹配到）
            if (!metaData) {
                metaData = {
                    title: '產品目錄 | 光華工業有限公司',
                    description: '瀏覽光華工業所有的產品系列。',
                    image: defaultImage,
                    url: url.href
                };
            }

            // 將 catalog 頁面需要的 rewriter 任務加入佇列
            rewriters.push(
                ['title', new TitleRewriter(metaData.title)],
                ['head', new HeadRewriter(metaData)],
                ['#category-description-container', new ContentInjector('#category-description-container', categoryDescriptionHtml)]
            );

        } else if (pathname === '/') {
            baseHtmlPath = '/index.html';
            metaData = {
                title: '光華工業有限公司 - 專業運動用品製造商',
                description: '光華工業擁有超過50年專業製造經驗，提供高品質乒乓球拍、羽球拍、跳繩、球棒等各式運動用品。',
                image: 'https://images.unsplash.com/photo-1543351368-0414336065e9?q=80&w=2070&auto-format&fit=crop',
                url: url.href
            };
            // 將首頁需要的 rewriter 任務加入佇列
            rewriters.push(
                ['title', new TitleRewriter(metaData.title)],
                ['head', new HeadRewriter(metaData)]
            );
        }

    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
        // 即使資料庫查詢失敗，也應繼續渲染基礎頁面，避免網站完全掛掉
    }

    // 如果沒有匹配到任何需要 SSR 的頁面，交給下一個處理程序
    if (!baseHtmlPath) {
        return next();
    }

    // 從 ASSETS 獲取基礎 HTML 檔案的回應
    const assetResponse = await env.ASSETS.fetch(new URL(baseHtmlPath, request.url));
    
    // 如果沒有任何 rewriter 任務，直接回傳原始回應
    if (rewriters.length === 0) {
        return assetResponse;
    }
    
    // 建立一個 rewriter 實例，並動態串聯所有任務
    let rewriter = new HTMLRewriter();
    rewriters.forEach(([selector, handler]) => {
        rewriter.on(selector, handler);
    });

    // 執行轉換並回傳最終的 HTML
    return rewriter.transform(assetResponse);
}