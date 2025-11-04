// functions/sitemap.xml.js

// 輔助函式：XML 特殊字符轉義
const escapeXml = (unsafe) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
};

export async function onRequest(context) {
    const { env } = context;
    const baseUrl = new URL(context.request.url).origin; // 自動獲取網站根網址

    try {
        const db = env.D1_DB;
        let sitemapContent = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

        // --- 1. 新增靜態頁面 (首頁和目錄頁) ---
        const staticPages = ['/', '/catalog'];
        staticPages.forEach(page => {
            sitemapContent += `
  <url>
    <loc>${baseUrl}${page}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <priority>${page === '/' ? '1.00' : '0.90'}</priority>
  </url>`;
        });

        // --- 2. 獲取所有分類頁面 ---
        const { results: categories } = await db.prepare("SELECT id, name, updatedAt FROM categories").run();
        if (categories) {
            categories.forEach(category => {
                const categoryUrlName = encodeURIComponent(category.name);
                sitemapContent += `
  <url>
    <loc>${baseUrl}/catalog/category/${category.id}/${categoryUrlName}</loc>
    <lastmod>${new Date(category.updatedAt).toISOString()}</lastmod>
    <priority>0.80</priority>
  </url>`;
            });
        }

        // --- 3. 獲取所有產品頁面 ---
        // 注意：這裡一次性獲取所有產品，如果產品超過數千個，未來可能需要分批處理
        const { results: products } = await db.prepare("SELECT id, name, updatedAt FROM products").run();
        if (products) {
            products.forEach(product => {
                const productUrlName = encodeURIComponent(product.name);
                sitemapContent += `
  <url>
    <loc>${baseUrl}/catalog/product/${product.id}/${productUrlName}</loc>
    <lastmod>${new Date(product.updatedAt).toISOString()}</lastmod>
    <priority>0.70</priority>
  </url>`;
            });
        }

        sitemapContent += '</urlset>';

        // --- 4. 回傳最終的 XML ---
        return new Response(sitemapContent, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 's-maxage=86400', // 建議快取一天 (86400秒)
            },
        });

    } catch (e) {
        console.error("Sitemap generation failed:", e);
        return new Response("Error generating sitemap.", { status: 500 });
    }
}