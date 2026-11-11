const { test, expect } = require('@playwright/test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');

let fixtures;
test.beforeAll(async () => { fixtures = await import('../fixtures.mjs'); });

async function clean(page) {
    await expect(page.locator('[onerror], [onload], [onclick]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
}

test('JSON-LD remains one JSON script and preserves the original data', async ({ page }) => {
    const { StructuredDataInjector } = await import(pathToFileURL(path.resolve('functions/_lib/injectors.js')).href);
    let html;
    new StructuredDataInjector({ name: fixtures.description }).element({ append(value) { html = value; } });
    await page.setContent(html);
    await expect(page.locator('script')).toHaveCount(1);
    await expect(page.locator('img')).toHaveCount(0);
    expect(JSON.parse(await page.locator('script').textContent())).toEqual({ name: fixtures.description });
    await clean(page);
});

test('SSR category text, newlines and JSON-LD cannot inject markup', async ({ page }) => {
    await page.route('**/js/**', route => route.abort());
    await page.goto('/catalog/category/1/test');
    await expect(page.locator('#category-description-container')).toContainText(fixtures.description.split('\n')[1]);
    await expect(page.locator('#category-description-container br')).toHaveCount(1);
    await clean(page);
});

test('SSR product images, price and JSON-LD are safe', async ({ page }) => {
    await page.route('**/js/**', route => route.abort());
    await page.goto('/catalog/product/2/test');
    await expect(page.locator('#product-detail-info h2')).toHaveText('正常名稱');
    await clean(page);
});

test('customer rendering and slider retain names and working images', async ({ page }) => {
    await page.goto('/catalog/product/1/test');
    await expect(page.locator('#product-detail-info h2')).toHaveText(fixtures.name);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', `${fixtures.name} | 光華工業`);
    await expect(page.locator('#slider-wrapper img')).toHaveAttribute('alt', `${fixtures.name} - 圖片 1`);
    await expect(page.locator('#slider-wrapper img')).toHaveJSProperty('naturalWidth', 100);
    await clean(page);
    await page.goto('/catalog/product/2/test');
    await expect(page.locator('#product-detail-info h2')).toHaveText('正常名稱');
    await clean(page);
});

async function authenticated(page, request) {
    const { token } = await (await request.get('http://127.0.0.1:8791/token')).json();
    await page.setExtraHTTPHeaders({ 'Cf-Access-Jwt-Assertion': token });
}

test('management routes deny anonymous and forged-token requests', async ({ request }) => {
    for (const route of ['/admin', '/admin/', '/admin/index.html', '/admin/batch-upload',
        '/admin/batch-upload.html', '/admin/print-catalog', '/admin/print-catalog.html',
        '/admin/api/all-data', '/admin/api/products', '/%61dmin/', '/%61dmin/api/all-data', '/admin%2Fapi/all-data',
        '//admin/', '/ADMIN/', '/admin//api/products']) {
        const response = await request.get(`http://127.0.0.1:8790${route}`, { maxRedirects: 0 });
        expect(response.status(), route).toBe(403);
    }
    const forged = await request.post('/admin/api/products', {
        headers: { 'Cf-Access-Jwt-Assertion': 'forged' }, data: { name: 'must not be saved' }
    });
    expect(forged.status()).toBe(403);
});

test('legacy pages redirect and old management API cannot read or write', async ({ request }) => {
    for (const [from, to] of [['/admin.html', '/admin/'], ['/batch-upload', '/admin/batch-upload'],
        ['/batch-upload.html', '/admin/batch-upload'], ['/print-catalog', '/admin/print-catalog'],
        ['/print-catalog.html', '/admin/print-catalog']]) {
        const response = await request.get(from, { maxRedirects: 0 });
        expect(response.status()).toBe(308);
        expect(new URL(response.headers().location).pathname).toBe(to);
    }
    for (const method of ['GET', 'POST', 'DELETE', 'PUT']) {
        expect((await request.fetch('/api/products', { method })).status()).toBe(404);
    }
});

test('authenticated management renders data safely and links to protected tools', async ({ page, request }) => {
    await authenticated(page, request);
    await page.goto('/admin/');
    await expect(page.locator('.product-info h3').filter({ hasText: fixtures.name })).toHaveCount(1);
    await expect(page.locator('a[href="/admin/batch-upload"]')).toHaveCount(1);
    await expect(page.locator('a[href="/admin/print-catalog"]')).toHaveCount(1);
    await page.locator('#manage-categories-btn').click();
    await expect(page.locator('.cm-name')).toHaveText(fixtures.name);
    await clean(page);
});

test('CSV preview treats product names and SKUs as text', async ({ page, request }) => {
    await authenticated(page, request);
    await page.goto('/admin/batch-upload');
    const field = value => `"${value.replaceAll('"', '""')}"`;
    await page.locator('#csv-upload-input').setInputFiles({ name: 'security.csv', mimeType: 'text/csv',
        buffer: Buffer.from(`name,sku\n${field(fixtures.name)},${field('SKU<&"')}`) });
    await expect(page.locator('.data-item-header')).toContainText(fixtures.name);
    await clean(page);
});

test('catalog preview renders category, product, SKU, image and error text safely', async ({ page, request }) => {
    await authenticated(page, request);
    await page.goto('/admin/print-catalog');
    await expect(page.locator('#category-tree-wrapper label')).toHaveText(fixtures.name);
    await page.locator('#category-tree-wrapper input').check();
    await page.locator('#generate-preview-btn').click();
    await expect(page.locator('.product-name').filter({ hasText: fixtures.name })).toHaveCount(1);
    await expect(page.locator('.product-sku').filter({ hasText: 'SKU<&"' })).toHaveCount(1);
    await clean(page);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#download-pdf-btn').click();
    const download = await downloadEvent;
    const pdf = await fs.readFile(await download.path());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await page.route('**/admin/api/products?**', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.locator('#generate-preview-btn').click();
    await expect(page.locator('.error')).toBeVisible();
    await clean(page);
});

test('protected management keeps desktop/mobile and light/dark rendering', async ({ page, request }) => {
    await authenticated(page, request);
    for (const [width, theme] of [[1280, 'light'], [390, 'dark']]) {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        await page.goto('/admin/');
        await expect(page.locator('.product-info h3').filter({ hasText: fixtures.name })).toBeVisible();
        expect(await page.locator('body').evaluate(body => body.classList.contains('dark-mode'))).toBe(theme === 'dark');
        await page.screenshot({ path: `.wrangler/screenshots/admin-${width}-${theme}.png`, fullPage: true });
        await clean(page);
    }
});

test('catalog loading errors containing markup remain visible text', async ({ page, request }) => {
    await authenticated(page, request);
    await page.addInitScript(message => {
        window.fetch = async () => { throw new Error(message); };
    }, fixtures.name);
    await page.goto('/admin/print-catalog');
    await expect(page.locator('#category-tree-wrapper .error')).toHaveText(fixtures.name);
    await clean(page);
});

test('authenticated API routes preserve local D1/R2 operations and reject cross-site saves', async ({ request }) => {
    const { token } = await (await request.get('http://127.0.0.1:8791/token')).json();
    const headers = { 'Cf-Access-Jwt-Assertion': token };
    const categoryResponse = await request.post('/admin/api/categories', {
        headers, data: { name: '隔離驗證', description: '分類\n說明' }
    });
    expect(categoryResponse.status()).toBe(201);
    const category = await categoryResponse.json();
    const upload = await request.put('/admin/api/upload/isolated.png', {
        headers: { ...headers, 'Content-Type': 'image/png' }, data: Buffer.from('isolated-upload')
    });
    expect(upload.status()).toBe(200);
    const image = await upload.json();
    const data = { name: '隔離產品', sku: 'ISOLATED', ean13: '', description: '產品\n說明',
        price: 50, categoryId: category.id, imageUrls: [{ url: image.url, size: 85 }] };
    const created = await request.post('/admin/api/products', { headers, data });
    expect(created.status()).toBe(201);
    const product = await created.json();
    expect(product.imageUrls).toEqual(data.imageUrls);
    expect((await request.post('/admin/api/products', {
        headers: { ...headers, Origin: 'https://other.example' }, data: { ...data, id: product.id, name: '不應寫入' }
    })).status()).toBe(403);
    const read = await request.get(`/admin/api/products/${product.id}`, { headers });
    expect((await read.json()).name).toBe(data.name);
    const updated = await request.post('/admin/api/products', { headers, data: { ...data, id: product.id, price: 60 } });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).price).toBe(60);
    expect((await request.post('/admin/api/reorder-categories', {
        headers, data: [{ id: category.id, parentId: null, sortOrder: 1 }]
    })).status()).toBe(200);
    expect((await request.delete(`/admin/api/products/${product.id}`, { headers })).status()).toBe(200);
    expect((await request.get(`/admin/api/products/${product.id}`, { headers })).status()).toBe(404);
    expect((await request.post('/admin/api/batch-create', { headers, data: {
        products: [{ name: '批次隔離產品', sku: 'ISOLATED-BATCH', price: '70', category: '隔離驗證', imageUrls: [] }]
    } })).status()).toBe(200);
    const list = await (await request.get(`/admin/api/products?categoryIds=${category.id}`, { headers })).json();
    expect(list.products.map(p => p.sku)).toEqual(['ISOLATED-BATCH']);
    expect((await request.delete(`/admin/api/products/${list.products[0].id}`, { headers })).status()).toBe(200);
    expect((await request.delete(`/admin/api/categories/${category.id}`, { headers })).status()).toBe(200);
});
