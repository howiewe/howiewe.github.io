// migrate.js
const fs = require('fs');
const path = require('path');

console.log('開始生成 D1 遷移 SQL 腳本...');

// 讀取 JSON 檔案
const categories = JSON.parse(fs.readFileSync(path.join(__dirname, 'categories.json'), 'utf-8'));
const products = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf-8'));

let sqlStatements = '-- 自動生成的 D1 遷移腳本 --\n\n';

// 處理分類
sqlStatements += '-- 匯入分類資料 --\n';
categories.forEach(cat => {
    const parentId = cat.parentId === null ? 'NULL' : cat.parentId;
    const safeName = cat.name.replace(/'/g, "''");
    sqlStatements += `INSERT INTO categories (id, name, parentId) VALUES (${cat.id}, '${safeName}', ${parentId});\n`;
});

sqlStatements += '\n-- 匯入產品資料 --\n';
// 處理產品
products.forEach(prod => {
    const safeName = prod.name.replace(/'/g, "''");
    const safeDesc = prod.description ? prod.description.replace(/'/g, "''") : '';
    const safeSku = prod.sku ? prod.sku.replace(/'/g, "''") : `SKU-${prod.id}`;
    const safeEan13 = prod.ean13 ? prod.ean13.replace(/'/g, "''") : '';
    const imageUrlsString = JSON.stringify(prod.imageUrls || []);

    sqlStatements += `INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (${prod.id}, '${safeSku}', '${safeName}', '${safeEan13}', ${prod.price}, '${safeDesc}', '${imageUrlsString}', ${prod.imageSize || 90}, ${prod.categoryId});\n`;
});

fs.writeFileSync(path.join(__dirname, 'migration.sql'), sqlStatements);

console.log('✅ 成功生成 migration.sql 檔案！');
console.log('下一步，請在終端機執行以下指令來匯入資料：');
console.log('wrangler d1 execute product-catalog --file=migration.sql');