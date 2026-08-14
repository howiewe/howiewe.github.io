// functions/[[path]].js
import { escapeXml } from './_lib/utils.js';
import { generateMetaTagsHTML } from './_lib/seo.js';
import {
    CategoryLobbyInjector,
    FeaturedCategoryInjector,
    HeadRewriter,
    TitleRewriter,
    StructuredDataInjector,
    BreadcrumbInjector,
    ContentInjector,
    ProductListInjector,
    SidebarInjector,
    HomepageCategoriesInjector
} from './_lib/injectors.js';

// 輔助函式：取得分類的父子祖先階層陣列（由頂層至當前分類）
function getCategoryAncestors(categoryId, allCategories) {
    if (!categoryId || !allCategories || allCategories.length === 0) return [];
    const ancestors = [];
    let currentId = categoryId;
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const cat = allCategories.find(c => c.id === currentId);
        if (!cat) break;
        ancestors.unshift(cat);
        currentId = cat.parentId;
    }
    return ancestors;
}

// --- 主要請求處理函式 ---
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
        const { results: allCategories } = await env.D1_DB.prepare("SELECT id, name, description, parentId, sortOrder FROM categories").run();

        if (pathname === '/catalog/category') {
            baseHtmlPath = '/catalog-lobby.html';

            rewriters.push(['#category-tree', new SidebarInjector(allCategories, null)]);

            const metaData = {
                title: '產品分類總覽 | 光華工業',
                description: '探索光華工業全系列運動用品，含乒乓球拍、羽球拍、跳繩、球棒等多元品類，超過50年專業製造經驗，提供批發採購與外銷客製詢問。',
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

            // --- 處理精選分類 (優先尋找「運動用品」，若無則使用第一個頂層分類) ---
            const featuredCategoryName = '運動用品';
            let featuredCategory = allCategories.find(c => c.name === featuredCategoryName);
            if (!featuredCategory) {
                featuredCategory = allCategories.find(c => c.parentId === null) || allCategories[0];
            }

            let featuredImageObj = { url: defaultImage, size: 90 };

            if (featuredCategory) {
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
                `).bind(featuredCategory.id).first();

                if (randomImageResult && randomImageResult.imageUrls) {
                    try {
                        const parsed = JSON.parse(randomImageResult.imageUrls);
                        if (parsed && parsed.length > 0 && parsed[0].url) {
                            featuredImageObj = {
                                url: parsed[0].url,
                                size: parsed[0].size || 90
                            };
                        }
                    } catch (e) { }
                }

                rewriters.push(['#featured-category-container', new FeaturedCategoryInjector(featuredCategory, featuredImageObj, defaultImage)]);
            }

            // 渲染其餘分類 (排除精選分類)
            const categoriesToDisplay = allCategories.filter(c => featuredCategory ? c.id !== featuredCategory.id : true);

            // 批次查詢每個分類的代表圖片 (含自訂尺寸 size)
            const categoryImagesMap = new Map();
            if (categoriesToDisplay.length > 0) {
                const imageStmts = categoriesToDisplay.map(cat =>
                    env.D1_DB.prepare(`
                        SELECT p.imageUrls FROM products p
                        WHERE p.categoryId IN (
                            WITH RECURSIVE dc(id) AS (
                                SELECT id FROM categories WHERE id = ?
                                UNION ALL
                                SELECT c.id FROM categories c JOIN dc ON c.parentId = dc.id
                            )
                            SELECT id FROM dc
                        )
                        AND p.imageUrls IS NOT NULL AND p.imageUrls != '[]'
                        ORDER BY RANDOM() LIMIT 1
                    `).bind(cat.id)
                );

                try {
                    const imageResults = await env.D1_DB.batch(imageStmts);
                    categoriesToDisplay.forEach((cat, i) => {
                        try {
                            const row = imageResults[i]?.results?.[0];
                            if (row?.imageUrls) {
                                const parsed = JSON.parse(row.imageUrls);
                                const imgUrl = parsed[0]?.url;
                                const imgSize = parsed[0]?.size || 90;
                                if (imgUrl) categoryImagesMap.set(cat.id, { url: imgUrl, size: imgSize });
                            }
                        } catch (e) { }
                    });
                } catch (batchError) {
                    console.error("批次獲取分類圖片失敗:", batchError);
                }
            }

            rewriters.push(['#category-grid-container', new CategoryLobbyInjector(categoriesToDisplay, url.origin, categoryImagesMap, defaultImage)]);

        } else if (pathname.startsWith('/catalog')) {
            baseHtmlPath = '/catalog.html';

            let metaData;
            let structuredData = null;
            let categoryId = null;
            let activeSidebarId = 'all';

            if (pathname.startsWith('/catalog/product/')) {
                const id = pathname.split('/')[3];
                const product = id && !isNaN(id) ? await env.D1_DB.prepare(
                    "SELECT id, sku, name, description, imageUrls, price, ean13, categoryId FROM products WHERE id = ?"
                ).bind(id).first() : null;

                if (product) {
                    if (product.categoryId) activeSidebarId = product.categoryId;
                    let image = defaultImage;
                    let images = [];
                    if (product.imageUrls) try {
                        const parsedImages = JSON.parse(product.imageUrls);
                        images = parsedImages.map(img => img.url);
                        image = images[0] || defaultImage;
                    } catch (e) { }

                    const canonicalUrl = `${url.origin}/catalog/product/${product.id}/${encodeURIComponent(product.name)}`;

                    metaData = { title: `${product.name} | 光華工業`, description: product.description, image: image, url: canonicalUrl };

                    structuredData = {
                        "@context": "https://schema.org/",
                        "@type": "Product",
                        "name": product.name,
                        "image": images.length > 0 ? images : [image],
                        "description": product.description || product.name,
                        "sku": product.sku || `KWH-${product.id}`,
                        "mpn": product.sku || `KWH-${product.id}`,
                        "gtin13": product.ean13 || undefined,
                        "brand": { "@type": "Brand", "name": "光華工業" },
                        "offers": {
                            "@type": "Offer",
                            "url": canonicalUrl,
                            "priceCurrency": "TWD",
                            "price": product.price || 0,
                            "availability": "https://schema.org/InStock"
                        }
                    };

                    const ancestors = product.categoryId ? getCategoryAncestors(product.categoryId, allCategories) : [];
                    const breadcrumbItems = [
                        { name: '首頁', href: '/' },
                        { name: '產品分類', href: '/catalog/category' }
                    ];
                    const breadcrumbElements = [
                        { "@type": "ListItem", "position": 1, "name": "首頁", "item": url.origin },
                        { "@type": "ListItem", "position": 2, "name": "產品分類", "item": `${url.origin}/catalog/category` }
                    ];

                    let pos = 3;
                    for (const cat of ancestors) {
                        const catUrl = `${url.origin}/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}`;
                        breadcrumbItems.push({ name: cat.name, href: `/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}` });
                        breadcrumbElements.push({ "@type": "ListItem", "position": pos++, "name": cat.name, "item": catUrl });
                    }
                    breadcrumbItems.push({ name: product.name });
                    breadcrumbElements.push({ "@type": "ListItem", "position": pos++, "name": product.name });

                    rewriters.push(['head', new StructuredDataInjector({
                        "@context": "https://schema.org",
                        "@type": "BreadcrumbList",
                        "itemListElement": breadcrumbElements
                    })]);

                    // 視覺麵包屑
                    rewriters.push(['#breadcrumb-container', new BreadcrumbInjector(breadcrumbItems)]);
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const idStr = pathname.split('/')[3];
                if (idStr && !isNaN(idStr)) {
                    categoryId = parseInt(idStr);
                    activeSidebarId = categoryId;
                    const category = await env.D1_DB.prepare("SELECT id, name, description FROM categories WHERE id = ?").bind(categoryId).first();
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

                        const canonicalUrl = `${url.origin}/catalog/category/${category.id}/${encodeURIComponent(category.name)}`;

                        metaData = { title: `${category.name} | 光華工業`, description: category.description || `光華工業「${category.name}」系列專業運動器材，涵蓋各式球拍、球具與訓練配件，歡迎批發採購與外銷洽詢。`, image: image, url: canonicalUrl };

                        const ancestors = getCategoryAncestors(categoryId, allCategories);
                        const breadcrumbItems = [
                            { name: '首頁', href: '/' },
                            { name: '產品分類', href: '/catalog/category' }
                        ];
                        const breadcrumbElements = [
                            { "@type": "ListItem", "position": 1, "name": "首頁", "item": url.origin },
                            { "@type": "ListItem", "position": 2, "name": "產品分類", "item": `${url.origin}/catalog/category` }
                        ];

                        let pos = 3;
                        for (let i = 0; i < ancestors.length; i++) {
                            const isLast = i === ancestors.length - 1;
                            const cat = ancestors[i];
                            const catUrl = `${url.origin}/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}`;
                            if (isLast) {
                                breadcrumbItems.push({ name: cat.name });
                                breadcrumbElements.push({ "@type": "ListItem", "position": pos++, "name": cat.name });
                            } else {
                                breadcrumbItems.push({ name: cat.name, href: `/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}` });
                                breadcrumbElements.push({ "@type": "ListItem", "position": pos++, "name": cat.name, "item": catUrl });
                            }
                        }

                        rewriters.push(['head', new StructuredDataInjector({
                            "@context": "https://schema.org",
                            "@type": "BreadcrumbList",
                            "itemListElement": breadcrumbElements
                        })]);

                        // 視覺麵包屑
                        rewriters.push(['#breadcrumb-container', new BreadcrumbInjector(breadcrumbItems)]);
                    }
                }
            }

            if (!metaData) {
                metaData = { title: '全部產品 | 光華工業', description: '探索光華工業完整的運動用品目錄，包含乒乓球拍、羽球拍、跳繩、球棒等多種專業運動器材，提供批發與外銷客製服務。', image: defaultImage, url: `${url.origin}/catalog` };

                rewriters.push(['head', new StructuredDataInjector({
                    "@context": "https://schema.org",
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        { "@type": "ListItem", "position": 1, "name": "首頁", "item": url.origin },
                        { "@type": "ListItem", "position": 2, "name": "全部產品" }
                    ]
                })]);

                rewriters.push(['#breadcrumb-container', new BreadcrumbInjector([
                    { name: '首頁', href: '/' },
                    { name: '全部產品' }
                ])]);
            }

            rewriters.push(['#category-tree', new SidebarInjector(allCategories, activeSidebarId)]);
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

            // 取得當前分類名稱以強化產品圖片 alt 語意
            let currentCategoryName = '';
            if (categoryId) {
                const catRow = allCategories.find(c => c.id === categoryId);
                if (catRow) currentCategoryName = catRow.name;
            }
            rewriters.push(['#product-list', new ProductListInjector(initialProducts || [], currentCategoryName)]);

            if (categoryId) {
                const category = await env.D1_DB.prepare("SELECT description FROM categories WHERE id = ?").bind(categoryId).first();
                if (category && category.description) {
                    const descHtml = `<p>${category.description.replace(/\n/g, '<br>')}</p>`;
                    rewriters.push(['#category-description-container', new ContentInjector('', descHtml)]);
                }
            }

        } else if (pathname === '/') {
            baseHtmlPath = '/index.html';

            // 首頁 OG / meta
            const metaData = {
                title: '光華工業有限公司',
                description: '光華工業擁有超過50年專業製造經驗，提供高品質乒乓球拍、羽球拍、跳繩、球棒等各式運動用品。',
                image: defaultImage,
                url: url.href
            };
            rewriters.push(['title', new TitleRewriter(metaData.title)]);
            rewriters.push(['head', new HeadRewriter(metaData)]);

            // 首頁 JSON-LD（Organization）
            const orgStructuredData = {
                "@context": "https://schema.org",
                "@type": "SportsGoodsStore",
                "name": "光華工業有限公司",
                "url": url.origin,
                "description": metaData.description,
                "telephone": "+886-4-7772514",
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "505彰化縣鹿港鎮鹿東路361巷176號",
                    "addressLocality": "鹿港鎮",
                    "addressRegion": "彰化縣",
                    "postalCode": "505",
                    "addressCountry": "TW"
                }
            };
            rewriters.push(['head', new StructuredDataInjector(orgStructuredData)]);

            // --- 頂層分類 + 代表圖 (batch 一次請求) ---
            let topLevelCategories = allCategories
                .filter(c => c.parentId === null && c.name !== '居家用品')
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            // 若頂層僅有單一「運動用品」大類，自動帶出其旗下子分類展示
            if (topLevelCategories.length === 1 && topLevelCategories[0].name === '運動用品') {
                const sportsParentId = topLevelCategories[0].id;
                const subCats = allCategories
                    .filter(c => c.parentId === sportsParentId && c.name !== '居家用品')
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                if (subCats.length > 0) {
                    topLevelCategories = subCats;
                }
            }
            topLevelCategories = topLevelCategories.slice(0, 6);

            if (topLevelCategories.length > 0) {
                // 用 D1 batch 一次拉取，避免 N+1 查詢
                const imageStmts = topLevelCategories.map(cat =>
                    env.D1_DB.prepare(`
                        SELECT p.imageUrls FROM products p
                        WHERE p.categoryId IN (
                            WITH RECURSIVE dc(id) AS (
                                SELECT id FROM categories WHERE id = ?
                                UNION ALL
                                SELECT c.id FROM categories c JOIN dc ON c.parentId = dc.id
                            )
                            SELECT id FROM dc
                        )
                        AND p.imageUrls IS NOT NULL AND p.imageUrls != '[]'
                        ORDER BY RANDOM() LIMIT 1
                    `).bind(cat.id)
                );

                const imageResults = await env.D1_DB.batch(imageStmts);
                const categoryImages = new Map();

                topLevelCategories.forEach((cat, i) => {
                    try {
                        const row = imageResults[i]?.results?.[0];
                        if (row?.imageUrls) {
                            const parsed = JSON.parse(row.imageUrls);
                            const imgUrl = parsed[0]?.url;
                            const imgSize = parsed[0]?.size || 90;
                            if (imgUrl) categoryImages.set(cat.id, { url: imgUrl, size: imgSize });
                        }
                    } catch (e) { /* 解析失敗，使用 defaultImage */ }
                });

                rewriters.push(['#homepage-categories', new HomepageCategoriesInjector(topLevelCategories, categoryImages, defaultImage)]);
            }
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