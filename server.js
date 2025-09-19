// 引入 Node.js 需要的模組
const http = require('http');
const fs = require('fs');
const path = require('path');

// 預先讀取 JSON 檔案到記憶體中
let productsData = [];
let categoriesData = [];

try {
    // 使用 utf-8 編碼讀取檔案，確保中文不會亂碼
    const productsPath = path.join(__dirname, 'products.json');
    const categoriesPath = path.join(__dirname, 'categories.json');

    productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
    categoriesData = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
    console.log('✅ products.json 和 categories.json 已成功載入到伺服器記憶體！');
} catch (error) {
    console.error('❌ 讀取 JSON 檔案失敗! 請檢查檔案是否存在且格式正確。', error);
    // 如果檔案讀取失敗，伺服器將無法提供資料，所以直接退出
    process.exit(1); 
}

// 建立伺服器
const server = http.createServer((req, res) => {
    console.log(`收到請求: ${req.method} ${req.url}`);

    // API 路由: 如果請求的是 /api/products
    if (req.url === '/api/products') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' // 允許所有來源的請求
        });
        res.end(JSON.stringify(productsData));
        return;
    }

    // API 路由: 如果請求的是 /api/categories
    if (req.url === '/api/categories') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(categoriesData));
        return;
    }

    // --- 靜態檔案伺服器邏輯 ---
    // 處理檔案路徑，預設為 index.html
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // 取得檔案的副檔名
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // 讀取並回傳檔案
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // 找不到檔案
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>');
            } else {
                // 伺服器內部錯誤
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            // 成功找到檔案
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// 啟動伺服器
const PORT = 8000;
// 使用 '0.0.0.0' 讓區域網路內的其他裝置可以訪問
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 伺服器正在 http://0.0.0.0:${PORT} 上運行`);
    console.log(`請在手機上訪問 http://[你電腦的IP]:${PORT}`);
});