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

    if (!env.D1_DB) {
        return next();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    const isAsset = pathname.slice(1).includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/public/');
    if (isAsset) {
        return next();
    }

    let metaData = null;
    let baseHtmlPath = null;
    const defaultImage = 'https://imagedelivery.net/v7-tA232h3t-IAn8qA-pXg/553b85d9-c03b-43d9-485e-526437149f00/public';

    let rewriters = [];

    // --- Rewriter 輔助類別 (保持不變) ---
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

    try {
        if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';
            let categoryDescriptionHtml = '';
            let categoryId = null;

            // --- 步驟 1: 優先處理 Meta 標籤 (URL 預覽)，這部分邏輯不應該被分頁影響 ---
            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                if (!isNaN(id)) {
                    const product = await env.D1_DB.prepare("SELECT name, description, imageUrls FROM products WHERE id = ?").bind(id).first();
                    if (product) {
                        let firstImageUrl = defaultImage;
                        if (product.imageUrls) {
                            try {
                                const images = JSON.parse(product.imageUrls);
                                if (images && images.length > 0 && images[0].url) { firstImageUrl = images[0].url; }
                            } catch (e) { console.error(`解析產品 ${id} 的 imageUrls 失敗:`, e); }
                        }
                        metaData = { title: `${product.name} | 光華工業有限公司`, description: product.description || '查看產品詳細資訊', image: firstImageUrl, url: url.href };
                    }
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const idStr = pathname.split('/')[3];
                if (!isNaN(idStr)) {
                    categoryId = parseInt(idStr); // 順便把 categoryId 記下來給後面用
                    const category = await env.D1_DB.prepare("SELECT name, description FROM categories WHERE id = ?").bind(categoryId).first();
                    if (category) {
                        if (category.description) {
                            const formattedDescription = category.description.replace(/\n/g, '<br>');
                            categoryDescriptionHtml = `<p>${formattedDescription}</p>`;
                        }
                        const randomProductImage = await env.D1_DB.prepare(`
                            SELECT p.imageUrls FROM products p WHERE p.categoryId IN (
                                WITH RECURSIVE descendant_categories(id) AS (
                                    SELECT id FROM categories WHERE id = ? UNION ALL SELECT c.id FROM categories c JOIN descendant_categories dc ON c.parentId = dc.id
                                ) SELECT id FROM descendant_categories
                            ) AND p.imageUrls IS NOT NULL AND p.imageUrls != '[]' ORDER BY RANDOM() LIMIT 1
                        `).bind(categoryId).first();
                        let categoryImage = defaultImage;
                        if (randomProductImage && randomProductImage.imageUrls) {
                            try {
                                const images = JSON.parse(randomProductImage.imageUrls);
                                if (images && images.length > 0 && images[0].url) { categoryImage = images[0].url; }
                            } catch (e) { console.error(`解析分類 ${categoryId} 的代表圖失敗:`, e); }
                        }
                        metaData = { title: `${category.name} | 光華工業有限公司`, description: category.description || `探索我們在「${category.name}」分類下的所有產品。`, image: categoryImage, url: url.href };
                    }
                }
            }
            // 如果以上都不匹配 (例如 /catalog 或 /catalog?page=2)，則使用預設的 Meta
            if (!metaData) {
                metaData = { title: '產品目錄 | 光華工業有限公司', description: '瀏覽光華工業所有的產品系列。', image: defaultImage, url: url.href };
            }

            // --- 步驟 2: 處理產品列表 SSR (預先渲染 body 內容)，這裡才考慮分頁 ---
            const page = parseInt(searchParams.get('page')) || 1;
            const limit = 24;
            const offset = (page - 1) * limit;

            let whereClauses = [];
            let bindings = [];

            if (categoryId) { // 使用剛才從路徑中解析出來的 categoryId
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
                const categoryIds = getSubCategoryIds(categoryId);
                whereClauses.push(`categoryId IN (${categoryIds.map(() => '?').join(',')})`);
                bindings.push(...categoryIds);
            }
            
            const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
            const dataQueryString = `SELECT * FROM products ${whereString} ORDER BY price ASC LIMIT ? OFFSET ?`;
            const { results } = await env.D1_DB.prepare(dataQueryString).bind(...bindings, limit, offset).run();
            
            let initialProducts = [];
            if(results) {
                initialProducts = results.map(p => {
                    try { return { ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] }; } 
                    catch (e) { return { ...p, imageUrls: [] }; }
                });
            }

            // --- 步驟 3: 組合所有的 Rewriter 任務 ---
            rewriters.push(
                ['title', new TitleRewriter(metaData.title)],
                ['head', new HeadRewriter(metaData)],
                ['#category-description-container', new ContentInjector('#category-description-container', categoryDescriptionHtml)],
                ['#product-list', new ProductListInjector(initialProducts)]
            );

        } else if (pathname === '/') {
            // 首頁邏輯保持不變
            baseHtmlPath = '/index.html';
            metaData = { title: '光華工業有限公司 - 專業運動用品製造商', description: '光華工業擁有超過50年專業製造經驗，提供高品質乒乓球拍、羽球拍、跳繩、球棒等各式運動用品。', image: 'https://images.unsplash.com/photo-1543351368-0414336065e9?q=80&w=2070&auto-format&fit=crop', url: url.href };
            rewriters.push( ['title', new TitleRewriter(metaData.title)], ['head', new HeadRewriter(metaData)] );
        }

    } catch (dbError) {
        console.error("D1 查詢失敗:", dbError);
    }

    if (!baseHtmlPath) { return next(); }

    const assetResponse = await env.ASSETS.fetch(new URL(baseHtmlPath, request.url));
    if (rewriters.length === 0) { return assetResponse; }
    
    let rewriter = new HTMLRewriter();
    // 這裡我們需要動態加入 rewriter 規則
    rewriters.forEach(([selector, handler]) => {
        // 為了安全，檢查 handler 是否真的存在
        if(handler) {
           rewriter.on(selector, handler);
        }
    });

    return rewriter.transform(assetResponse);
}

// 確保其他輔助函式存在 (TitleRewriter, HeadRewriter, ContentInjector)
// (這些您原本的檔案裡就有，這裡只是為了確保完整性)
class HeadRewriter { constructor(metaData) { this.metaData = metaData; } element(element) { if (this.metaData) { element.append(generateMetaTagsHTML(this.metaData), { html: true }); } } }
class TitleRewriter { constructor(title) { this.title = title; } element(element) { if (this.title) { element.setInnerContent(this.title); } } }
class ContentInjector { constructor(selector, content) { this.selector = selector; this.content = content; } element(element) { if (this.content) { element.setInnerContent(this.content, { html: true }); } } }
function generateMetaTagsHTML(data) { const escape = (str) => str ? str.replace(/"/g, '&quot;') : ''; const description = (data.description || '').substring(0, 160); return `
<meta property="og:title" content="${escape(data.title)}" />
<meta name="description" content="${escape(description)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:image" content="${data.image || ''}" />
<meta property="og:url" content="${data.url || ''}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image">`;
}