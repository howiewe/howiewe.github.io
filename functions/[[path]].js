// functions/[[path]].js (最終修正版)

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
    element(element) { if (this.metaData) element.append(generateMetaTagsHTML(this.metaData), { html: true }); }
}
class TitleRewriter {
    constructor(title) { this.title = title; }
    element(element) { if (this.title) element.setInnerContent(this.title); }
}

class StructuredDataInjector {
    constructor(jsonData) {
        this.jsonData = jsonData;
    }
    element(element) {
        if (this.jsonData) {
            const scriptContent = JSON.stringify(this.jsonData, null, 2);
            element.append(`<script type="application/ld+json">${scriptContent}<\/script>`, { html: true });
        }
    }
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


// --- 主要請求處理函式 (最終修正版) ---
export async function onRequest(context) {
    const { request, env, next } = context;

    if (!env.D1_DB) return next();

    const url = new URL(request.url);
    const pathname = url.pathname;

    const isAsset = pathname.slice(1).includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/public/');
    if (isAsset) return next();

    const defaultImage = 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public';
    let baseHtmlPath = null;
    let rewriters = [];

    try {
        if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';

            // --- 任務一：產生 Meta 標籤 (用於 URL 預覽) ---
            let metaData;
            let structuredData = null;
            let categoryId = null; // 在此宣告，讓後續任務可以共用

            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                // 1. 修改 SQL：從資料庫多拿一些欄位 (sku, price, ean13)
                const product = id && !isNaN(id) ? await env.D1_DB.prepare(
                    "SELECT id, sku, name, description, imageUrls, price, ean13 FROM products WHERE id = ?"
                ).bind(id).first() : null;

                if (product) {
                    // 處理圖片 (和之前一樣，但多了一個 images 陣列)
                    let image = defaultImage;
                    let images = []; // 用來放所有圖片 URL 的陣列
                    if (product.imageUrls) try {
                        const parsedImages = JSON.parse(product.imageUrls);
                        images = parsedImages.map(img => img.url);
                        image = images[0] || defaultImage;
                    } catch (e) { }

                    // 產生 Meta 標籤 (和之前一樣)
                    metaData = { title: `${product.name} | 光華工業`, description: product.description, image: image, url: url.href };

                    // 2. 新增：產生 Product 的 JSON-LD 結構化資料
                    const structuredData = {
                        "@context": "https://schema.org/",
                        "@type": "Product",
                        "name": product.name,
                        "image": images.length > 0 ? images : [image],
                        "description": product.description,
                        "sku": product.sku,
                        "mpn": product.sku,
                        "gtin13": product.ean13,
                        "brand": {
                            "@type": "Brand",
                            "name": "光華工業"
                        }
                    };

                    // 【核心修改】只有當產品價格是有效數字且大於 0 時，才加上 offers 物件
                    if (product.price && product.price > 0) {
                        structuredData.offers = {
                            "@type": "Offer",
                            "url": url.href,
                            "priceCurrency": "TWD",
                            "price": product.price,
                            // 【順便解決非重大問題】加上價格有效期，通常設一年後
                            "priceValidUntil": new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                            "availability": "https://schema.org/InStock"
                        };
                    }
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const idStr = pathname.split('/')[3];
                if (idStr && !isNaN(idStr)) {
                    categoryId = parseInt(idStr); // 取得當前分類 ID
                    const category = await env.D1_DB.prepare("SELECT name, description FROM categories WHERE id = ?").bind(categoryId).first();
                    if (category) {
                        // ▼▼▼ 【核心修正】尋找代表圖時，也要遞迴查詢子分類 ▼▼▼
                        const randomImageResult = await env.D1_DB.prepare(`
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
                        `).bind(categoryId).first();

                        let image = defaultImage;
                        if (randomImageResult) try { image = JSON.parse(randomImageResult.imageUrls)[0].url || defaultImage; } catch (e) { }
                        metaData = { title: `${category.name} | 光華工業`, description: category.description || `探索我們在「${category.name}」分類下的所有產品。`, image: image, url: url.href };
                    }
                }
            }

            if (!metaData) {
                metaData = { title: '產品目錄 | 光華工業', description: '瀏覽光華工業所有的產品系列。', image: defaultImage, url: url.href };
            }

            rewriters.push(['title', new TitleRewriter(metaData.title)]);
            rewriters.push(['head', new HeadRewriter(metaData)]);
            if (structuredData) {
                rewriters.push(['head', new StructuredDataInjector(structuredData)]);
            }

            // --- 任務二：預先渲染 Body 內容 ---
            const searchParams = url.searchParams;
            const page = parseInt(searchParams.get('page')) || 1;
            const limit = 24;
            const offset = (page - 1) * limit;

            let whereClauses = [];
            let bindings = [];

            // ▼▼▼ 【核心修正】使用遞迴邏輯查詢所有子分類的產品 ▼▼▼
            if (categoryId) {
                const { results: allCategories } = await env.D1_DB.prepare("SELECT id, parentId FROM categories").run();
                const getSubCategoryIds = (startId) => {
                    const ids = new Set([startId]);
                    const queue = [startId];
                    while (queue.length > 0) {
                        const currentId = queue.shift();
                        const children = allCategories.filter(c => c.parentId === currentId);
                        for (const child of children) { ids.add(child.id); queue.push(child.id); }
                    }
                    return Array.from(ids);
                };
                const categoryIdsToQuery = getSubCategoryIds(categoryId);
                whereClauses.push(`categoryId IN (${categoryIdsToQuery.map(() => '?').join(',')})`);
                bindings.push(...categoryIdsToQuery);
            }

            const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
            const query = `SELECT * FROM products ${whereString} ORDER BY price ASC LIMIT ? OFFSET ?`;
            bindings.push(limit, offset);

            const { results: initialProducts } = await env.D1_DB.prepare(query).bind(...bindings).run();

            rewriters.push(['#product-list', new ProductListInjector(initialProducts || [])]);

            // 分類描述注入
            if (categoryId) {
                const category = await env.D1_DB.prepare("SELECT description FROM categories WHERE id = ?").bind(categoryId).first();
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