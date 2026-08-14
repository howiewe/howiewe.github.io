// functions/[[path]].js
import { escapeXml } from './_lib/utils.js';
import { generateMetaTagsHTML } from './_lib/seo.js';
import {
    CategoryLobbyInjector,
    FeaturedCategoryInjector,
    HeadRewriter,
    TitleRewriter,
    StructuredDataInjector,
    ContentInjector,
    ProductListInjector,
    SidebarInjector,
    HomepageCategoriesInjector
} from './_lib/injectors.js';

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

        rewriters.push(['#category-tree', new SidebarInjector(allCategories)]);

        if (pathname === '/catalog/category') {
            baseHtmlPath = '/catalog-lobby.html';

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

            // --- 處理精選分類 (優先尋找「運動用品」，若無則使用第一個頂層分類) ---
            const featuredCategoryName = '運動用品';
            let featuredCategory = allCategories.find(c => c.name === featuredCategoryName);
            if (!featuredCategory) {
                featuredCategory = allCategories.find(c => c.parentId === null) || allCategories[0];
            }

            let featuredImage = defaultImage;

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
                            featuredImage = parsed[0].url;
                        }
                    } catch (e) { }
                }

                rewriters.push(['#featured-category-container', new FeaturedCategoryInjector(featuredCategory, featuredImage)]);
            }

            // 渲染其餘分類 (排除精選分類)
            const categoriesToDisplay = allCategories.filter(c => featuredCategory ? c.id !== featuredCategory.id : true);

            // 批次查詢每個分類的代表圖片
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
                                if (imgUrl) categoryImagesMap.set(cat.id, imgUrl);
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

                    const productBreadcrumb = {
                        "@context": "https://schema.org",
                        "@type": "BreadcrumbList",
                        "itemListElement": [
                            { "@type": "ListItem", "position": 1, "name": "首頁", "item": url.origin },
                            { "@type": "ListItem", "position": 2, "name": "產品分類", "item": `${url.origin}/catalog/category` },
                            { "@type": "ListItem", "position": 3, "name": product.name }
                        ]
                    };
                    rewriters.push(['head', new StructuredDataInjector(productBreadcrumb)]);
                }
            } else if (pathname.startsWith('/catalog/category/')) {
                const idStr = pathname.split('/')[3];
                if (idStr && !isNaN(idStr)) {
                    categoryId = parseInt(idStr);
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

                        metaData = { title: `${category.name} | 光華工業`, description: category.description || `探索我們在「${category.name}」分類下的所有產品。`, image: image, url: canonicalUrl };

                        const categoryBreadcrumb = {
                            "@context": "https://schema.org",
                            "@type": "BreadcrumbList",
                            "itemListElement": [
                                { "@type": "ListItem", "position": 1, "name": "首頁", "item": url.origin },
                                { "@type": "ListItem", "position": 2, "name": "產品分類", "item": `${url.origin}/catalog/category` },
                                { "@type": "ListItem", "position": 3, "name": category.name }
                            ]
                        };
                        rewriters.push(['head', new StructuredDataInjector(categoryBreadcrumb)]);
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
            const topLevelCategories = allCategories
                .filter(c => c.parentId === null)
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                .slice(0, 6); // 首頁最多顯示 6 個分類

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
                            if (imgUrl) categoryImages.set(cat.id, imgUrl);
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