// functions/sitemap.xml.js (最終修正與強化版)

// 輔助函式：XML 特殊字符轉義
const escapeXml = (unsafe) => {
    // 確保輸入是字串
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

// 輔助函式：建立單一 URL 項目
const createUrlEntry = (loc, lastmod, priority) => {
    // lastmod 可能是 null 或無效日期，做個防護
    const lastmodDate = lastmod ? new Date(lastmod) : new Date();
    const formattedLastmod = !isNaN(lastmodDate) ? lastmodDate.toISOString() : new Date().toISOString();

    return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${formattedLastmod}</lastmod>
    <priority>${priority}</priority>
  </url>`;
};

export async function onRequest(context) {
    const { env } = context;
    const baseUrl = new URL(context.request.url).origin;
    
    let urlEntries = [];

    try {
        const db = env.D1_DB;

        // --- 1. 新增靜態頁面 ---
        urlEntries.push(createUrlEntry(`${baseUrl}/`, null, '1.00'));
        urlEntries.push(createUrlEntry(`${baseUrl}/catalog`, null, '0.90'));

        // --- 2. 獲取所有分類頁面 (增加獨立的錯誤處理) ---
        try {
            const { results: categories } = await db.prepare("SELECT id, name, updatedAt FROM categories").run();
            if (categories) {
                categories.forEach(category => {
                    const categoryUrlName = encodeURIComponent(category.name);
                    const loc = `${baseUrl}/catalog/category/${category.id}/${categoryUrlName}`;
                    urlEntries.push(createUrlEntry(loc, category.updatedAt, '0.80'));
                });
            }
        } catch (e) {
            console.error("Sitemap: 獲取分類資料失敗:", e);
            // 即使分類失敗，也繼續執行，不要讓整個 sitemap 崩潰
        }

        // --- 3. 獲取所有產品頁面 (增加獨立的錯誤處理) ---
        try {
            const { results: products } = await db.prepare("SELECT id, name, updatedAt FROM products").run();
            if (products) {
                products.forEach(product => {
                    const productUrlName = encodeURIComponent(product.name);
                    const loc = `${baseUrl}/catalog/product/${product.id}/${productUrlName}`;
                    urlEntries.push(createUrlEntry(loc, product.updatedAt, '0.70'));
                });
            }
        } catch (e) {
            console.error("Sitemap: 獲取產品資料失敗:", e);
            // 即使產品失敗，也繼續執行
        }

        const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlEntries.join('')}
</urlset>`;

        return new Response(sitemapContent, {
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 's-maxage=86400', // 快取一天
            },
        });

    } catch (e) {
        console.error("Sitemap 產生過程發生嚴重錯誤:", e);
        // 如果發生嚴重錯誤，回傳一個純文字的錯誤訊息和 500 狀態碼
        // 這比回傳 HTML 錯誤頁面對 Googlebot 更友善
        return new Response("Error generating sitemap.", { status: 500 });
    }
}