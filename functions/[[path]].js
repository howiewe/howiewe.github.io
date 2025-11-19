// functions/[[path]].js (已整合分類總覽頁路由 和 您的特殊需求)

// --- 輔助函式：XML 特殊字符轉義 (從 sitemap.xml.js 借用過來，確保 injector 能用) ---
const escapeXml = (unsafe) => {
    const str = String(unsafe || '');
    return str.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
};

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

// --- Rewriter 類別 ---

// [核心修改] 用於渲染分類總覽頁的卡片
class CategoryLobbyInjector {
    constructor(categories, baseUrl) {
        this.categories = categories;
        this.baseUrl = baseUrl;
    }
    element(element) {
        if (this.categories && this.categories.length > 0) {
            let categoriesHtml = '';

            const topLevelCategories = this.categories.filter(c => c.parentId === null)
                                                      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            const sportsCategory = this.categories.find(c => c.name === '運動用品' && c.parentId === null);
            let specialSubcategories = [];

            if (sportsCategory) {
                specialSubcategories = this.categories.filter(c => c.parentId === sportsCategory.id)
                                                      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            }

            const categoriesToDisplay = topLevelCategories.concat(specialSubcategories);

            categoriesToDisplay.forEach(cat => {
                const categoryUrlName = encodeURIComponent(cat.name);
                const categoryHref = `/catalog/category/${cat.id}/${categoryUrlName}`;
                const description = cat.description ? escapeXml(cat.description.substring(0, 50) + '...') : '點擊查看更多產品';
                
                // ▼▼▼ 【核心修改】判斷是否為母分類，並加上額外的 class ▼▼▼
                const isParent = cat.parentId === null;
                const cardClass = `category-card ${isParent ? 'category-card--parent' : ''}`;
                // ▲▲▲ 修改結束 ▲▲▲

                categoriesHtml += `
                    <a href="${categoryHref}" class="${cardClass}">
                        <h3>${escapeXml(cat.name)}</h3>
                        <p>${description}</p>
                    </a>
                `;
            });

            element.setInnerContent(categoriesHtml, { html: true });
        } else {
            element.setInnerContent('<p class="empty-message">目前沒有任何分類。</p>', { html: true });
        }
    }
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
    constructor(jsonData) { this.jsonData = jsonData; }
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
                        <div class="image-container"><img src="${imageUrl}" class="product-image" alt="${escapeXml(product.name)}" loading="lazy" style="transform: scale(${imageSize / 100});"></div>
                        <div class="product-info"><h3>${escapeXml(product.name)}</h3>${priceHtml}</div>
                    </a>
                `;
            });
            element.setInnerContent(productsHtml, { html: true });
        } else {
            element.setInnerContent('<p class="empty-message">找不到符合條件的產品。</p>', { html: true });
        }
    }
}

// --- [新增] 側邊欄注入器 ---
class SidebarInjector {
    constructor(categories) {
        this.categories = categories || [];
    }

    element(element) {
        if (this.categories.length === 0) return;

        // 建構樹狀結構
        const categoryMap = new Map(this.categories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }

        // 生成 HTML
        let html = `<ul><li><a href="/catalog" class="active">所有產品</a></li></ul>`;
        html += this.createTreeHTML(tree);

        element.setInnerContent(html, { html: true });
    }

    createTreeHTML(nodes, depth = 0) {
        nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;
        for (const node of nodes) {
            const hasChildren = node.children && node.children.length > 0;
            const categoryUrlName = encodeURIComponent(node.name);
            // 注意：這裡的 href 格式必須與前端 script-customer.js 中的邏輯一致
            subHtml += `<li class="${hasChildren ? 'has-children' : ''}">
                <a href="/catalog/category/${node.id}/${categoryUrlName}">
                    <span>${escapeXml(node.name)}</span>`;
            
            if (hasChildren) {
                subHtml += `<span class="category-toggle-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
            }
            
            subHtml += `</a>`;
            
            if (hasChildren) {
                subHtml += this.createTreeHTML(node.children, depth + 1);
            }
            subHtml += '</li>';
        }
        return subHtml + '</ul>';
    }
}


// --- 主要請求處理函式 (已整合新路由) ---
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
        // 預先抓取所有分類資料，供側邊欄使用 (適用於所有頁面)
        const { results: allCategories } = await env.D1_DB.prepare("SELECT id, name, description, parentId, sortOrder FROM categories").run();
        
        // 注入側邊欄 (如果頁面上有 #category-tree)
        rewriters.push(['#category-tree', new SidebarInjector(allCategories)]);

        // --- [新邏輯] 處理分類總覽頁 /catalog/category ---
        if (pathname === '/catalog/category') {
            baseHtmlPath = '/catalog-lobby.html'; // 使用新的 HTML 模板

            const metaData = {
                title: '產品分類總覽 | 光華工業',
                description: '探索光華工業的所有產品系列，包含桌球、羽球、跳繩等專業運動用品。',
                image: defaultImage,
                url: url.href
            };
            rewriters.push(['title', new TitleRewriter(metaData.title)]);
            rewriters.push(['head', new HeadRewriter(metaData)]);

            const structuredData = {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                "name": "產品分類總覽",
                "description": "探索光華工業的所有產品系列。",
                "url": url.href
            };
            rewriters.push(['head', new StructuredDataInjector(structuredData)]);

            const breadcrumbData = {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "首頁", "item": url.origin },
                    { "@type": "ListItem", "position": 2, "name": "產品分類" }
                ]
            };
            rewriters.push(['head', new StructuredDataInjector(breadcrumbData)]);
            
            rewriters.push(['#category-grid-container', new CategoryLobbyInjector(allCategories || [], url.origin)]);
        
        // --- [原有邏輯] 處理 /catalog, /catalog/product/*, /catalog/category/* ---
        } else if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';

            let metaData;
            let structuredData = null;
            let categoryId = null; 

            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                const product = id && !isNaN(id) ? await env.D1_DB.prepare(
                    "SELECT id, sku, name, description, imageUrls, price, ean13, categoryId FROM products WHERE id = ?"
                ).bind(id).first() : null;

                if (product) {
                    let image = defaultImage;
                    let images = []; 
                    if (product.imageUrls) try {
                        const parsedImages = JSON.parse(product.imageUrls);
                        images = parsedImages.map(img => img.url);
                        image = images[0] || defaultImage;
                    } catch (e) { }

                    metaData = { title: `${product.name} | 光華工業`, description: product.description, image: image, url: url.href };

                    structuredData = {
                        "@context": "https://schema.org/",
                        "@type": "Product",
                        "name": product.name,
                        "image": images.length > 0 ? images : [image],
                        "description": product.description,
                        "sku": product.sku,
                        "mpn": product.sku,
                        "gtin13": product.ean13,
                        "brand": { "@type": "Brand", "name": "光華工業" },
                        "offers": {
                            "@type": "Offer",
                            "url": url.href,
                            "priceCurrency": "TWD",
                            "price": product.price,
                            "availability": "https://schema.org/InStock"
                        }
                    };
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const idStr = pathname.split('/')[3];
                if (idStr && !isNaN(idStr)) {
                    categoryId = parseInt(idStr);
                    const category = await env.D1_DB.prepare("SELECT name, description FROM categories WHERE id = ?").bind(categoryId).first();
                    if (category) {
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

            const searchParams = url.searchParams;
            const page = parseInt(searchParams.get('page')) || 1;
            const limit = 24;
            const offset = (page - 1) * limit;
            let whereClauses = [];
            let bindings = [];

            if (categoryId) {
                // const { results: allCategories } = await env.D1_DB.prepare("SELECT id, parentId FROM categories").run(); // 已在上方宣告
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

            if (categoryId) {
                const category = await env.D1_DB.prepare("SELECT description FROM categories WHERE id = ?").bind(categoryId).first();
                if (category && category.description) {
                    const descHtml = `<p>${category.description.replace(/\n/g, '<br>')}</p>`;
                    rewriters.push(['#category-description-container', new ContentInjector('', descHtml)]);
                }
            }

        // --- [原有邏輯] 處理首頁 / ---
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