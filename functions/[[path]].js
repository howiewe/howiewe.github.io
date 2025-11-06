// --- Meta 標籤與 Rewriter 輔助函式 ---
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
    element(element) { if (this.metaData) element.append(generateMetaTagsHTML(this.metaData), { html: true }); }
}
class TitleRewriter {
    constructor(title) { this.title = title; }
    element(element) { if (this.title) element.setInnerContent(this.title); }
}
class ContentInjector {
    constructor(selector, content) { this.selector = selector; this.content = content; }
    element(element) { if (this.content) element.setInnerContent(this.content, { html: true }); }
}
class ProductListInjector {
    constructor(products) { this.products = products; }
    element(element) {
        if (this.products && this.products.length > 0) {
            let productsHtml = '';
            this.products.forEach(product => {
                const productUrlName = encodeURIComponent(product.name);
                const productHref = `/catalog/product/${product.id}/${productUrlName}`;
                const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
                const imageUrl = firstImageObject ? firstImageObject.url : '';
                const imageSize = firstImageObject ? firstImageObject.size : 90;
                const priceHtml = (product.price !== null && product.price !== undefined) ? `<p class="price">$${product.price}</p>` : `<p class="price price-empty">&nbsp;</p>`;
                productsHtml += `
                    <a href="${productHref}" class="product-card">
                        <div class="image-container"><img src="${imageUrl}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${imageSize / 100});"></div>
                        <div class="product-info"><h3>${product.name}</h3>${priceHtml}</div>
                    </a>
                `;
            });
            element.setInnerContent(productsHtml, { html: true });
        } else {
            element.setInnerContent('<p class="empty-message">找不到符合條件的產品。</p>', { html: true });
        }
    }
}


// --- 主要請求處理函式 (最終穩定版) ---
export async function onRequest(context) {
    const { request, env, next } = context;

    if (!env.D1_DB) return next();

    const url = new URL(request.url);
    const pathname = url.pathname;

    const isAsset = pathname.slice(1).includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/public/');
    if (isAsset) return next();

    // 處理 /sitemap.xml 的請求，如果 sitemap.xml.js 存在
    if (pathname === '/sitemap.xml') {
        // 假設 sitemap 的邏輯在 functions/sitemap.xml.js 中
        // Cloudflare Pages 的檔案路由會自動處理，這裡只是以防萬一
        return next();
    }

    // 預設 Meta 資料
    const defaultImage = 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public';
    let baseHtmlPath = null;
    let rewriters = [];

    try {
        if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';

            // --- 任務一：產生 Meta 標籤 (用於 URL 預覽) ---
            // 這段邏輯只關心 pathname，完全忽略 ?page=X 參數，確保預覽穩定
            let metaData;
            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                const product = id && !isNaN(id) ? await env.D1_DB.prepare("SELECT name, description, imageUrls FROM products WHERE id = ?").bind(id).first() : null;
                if (product) {
                    let image = defaultImage;
                    if (product.imageUrls) try { image = JSON.parse(product.imageUrls)[0].url || defaultImage; } catch (e) { }
                    metaData = { title: `${product.name} | 光華工業`, description: product.description, image: image, url: url.href };
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const id = pathname.split('/')[3];
                const category = id && !isNaN(id) ? await env.D1_DB.prepare("SELECT name, description FROM categories WHERE id = ?").bind(id).first() : null;
                if (category) {
                    const randomImageResult = await env.D1_DB.prepare("SELECT imageUrls FROM products WHERE categoryId = ? AND imageUrls IS NOT NULL AND imageUrls != '[]' ORDER BY RANDOM() LIMIT 1").bind(id).first();
                    let image = defaultImage;
                    if (randomImageResult) try { image = JSON.parse(randomImageResult.imageUrls)[0].url || defaultImage; } catch (e) { }
                    metaData = { title: `${category.name} | 光華工業`, description: category.description || `探索我們在「${category.name}」分類下的所有產品。`, image: image, url: url.href };
                }
            }

            // 如果以上條件都不滿足，或找不到資料，則使用預設 Meta
            if (!metaData) {
                metaData = { title: '產品目錄 | 光華工業', description: '瀏覽光華工業所有的產品系列。', image: defaultImage, url: url.href };
            }

            rewriters.push(['title', new TitleRewriter(metaData.title)]);
            rewriters.push(['head', new HeadRewriter(metaData)]);


            // --- 任務二：預先渲染 Body 內容 (用於爬蟲內容索引) ---
            // 這段邏輯會讀取 ?page=X 參數來抓取對應頁碼的產品
            const searchParams = url.searchParams;
            const page = parseInt(searchParams.get('page')) || 1;
            const limit = 24;
            const offset = (page - 1) * limit;

            let query = "SELECT * FROM products";
            let bindings = [];

            const categoryIdStr = pathname.startsWith('/catalog/category/') ? pathname.split('/')[3] : null;
            if (categoryIdStr && !isNaN(categoryIdStr)) {
                query += " WHERE categoryId = ?";
                bindings.push(parseInt(categoryIdStr));
            }

            query += " ORDER BY price ASC LIMIT ? OFFSET ?";
            bindings.push(limit, offset);

            const { results: initialProducts } = await env.D1_DB.prepare(query).bind(...bindings).run();

            rewriters.push(['#product-list', new ProductListInjector(initialProducts || [])]);

            // 分類描述的注入 (如果適用)
            const categoryIdForDesc = categoryIdStr && !isNaN(categoryIdStr) ? parseInt(categoryIdStr) : null;
            if (categoryIdForDesc) {
                const category = await env.D1_DB.prepare("SELECT description FROM categories WHERE id = ?").bind(categoryIdForDesc).first();
                if (category && category.description) {
                    const descHtml = `<p>${category.description.replace(/\n/g, '<br>')}</p>`;
                    rewriters.push(['#category-description-container', new ContentInjector('', descHtml)]);
                }
            }

        } else if (pathname === '/') {
            baseHtmlPath = '/index.html';
            const metaData = { title: '光華工業有限公司 - 專業運動用品製造商', description: '光華工業擁有超過50年專業製造經驗，提供高品質乒乓球拍、羽球拍、跳繩、球棒等各式運動用品。', image: defaultImage, url: url.href };
            rewriters.push(['title', new TitleRewriter(metaData.title)]);
            rewriters.push(['head', new HeadRewriter(metaData)]);
        }

    } catch (dbError) {
        console.error("SSR 處理失敗:", dbError);
    }

    if (!baseHtmlPath) return next();

    const assetResponse = await env.ASSETS.fetch(new URL(baseHtmlPath, request.url));
    if (rewriters.length === 0) return assetResponse;

    let rewriter = new HTMLRewriter();
    rewriters.forEach(([selector, handler]) => {
        if (handler) rewriter.on(selector, handler);
    });

    return rewriter.transform(assetResponse);
}