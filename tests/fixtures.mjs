export const name = '測試 " ><img src=x onerror="window.__xss=1"> & 球拍';
export const description = '第一行 & 說明\n</script><img src=x onerror="window.__xss=1">';
export const badImage = '/missing" onerror="window.__xss=1';
export const category = { id: 1, name, description, parentId: null, sortOrder: 0 };

export const products = [
    { id: 1, name, description, sku: 'SKU<&"', ean13: '', price: 120, categoryId: 1,
        imageUrls: [{ url: '/test-image.svg', size: 80 }] },
    { id: 2, name: '正常名稱', description: '正常說明', sku: 'NORMAL', ean13: '',
        price: '<img src=x onerror="window.__xss=1">', categoryId: 1,
        imageUrls: [{ url: badImage, size: '90);color:red' }] }
];

const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
export const seedSql = `
CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    description TEXT, parentId INTEGER REFERENCES categories(id), sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT UNIQUE,
    ean13 TEXT, price REAL DEFAULT 0, description TEXT, categoryId INTEGER REFERENCES categories(id),
    imageUrls TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
INSERT INTO categories VALUES (1, ${quote(name)}, ${quote(description)}, NULL, 0, '2026-01-01', '2026-01-01');
${products.map(p => `INSERT INTO products VALUES (${p.id}, ${quote(p.name)}, ${quote(p.sku)}, '',
    ${quote(p.price)}, ${quote(p.description)}, 1, ${quote(JSON.stringify(p.imageUrls))}, '2026-01-01', '2026-01-01');`).join('\n')}
`;
