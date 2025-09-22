-- 自動生成的 D1 遷移腳本 --

-- 匯入分類資料 --
INSERT INTO categories (id, name, parentId) VALUES (1, '電子產品', NULL);
INSERT INTO categories (id, name, parentId) VALUES (2, '電腦周邊', 1);
INSERT INTO categories (id, name, parentId) VALUES (3, '滑鼠與鍵盤', 2);
INSERT INTO categories (id, name, parentId) VALUES (4, '生活配件', NULL);
INSERT INTO categories (id, name, parentId) VALUES (5, '包款', 4);
INSERT INTO categories (id, name, parentId) VALUES (6, '居家用品', NULL);

-- 匯入產品資料 --
INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (17001, 'MO-PRO-BLK-01', '無線光學滑鼠 Pro', '4719512078683', 1890, '頂級人體工學設計，2.4GHz 無線連接，靜音按鍵。', '["/images/product-17001-1758299164890-0.jpeg"]', 90, 3);
INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (17002, 'BP-URBAN-GRY-25L', '都會行者防水後背包', '4712345678907', 2499, '25L 大容量，防潑水牛津布材質，內含 15.6 吋筆電夾層。', '["/images/product-17002-1758297404672-0.png","/images/product-17002-1758297406155-1.png"]', 100, 5);
INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (17003, 'MUG-WHT-CLASSIC', '陶瓷簡約馬克杯', '4710904567894', 599, '採用高溫白瓷製成，手感溫潤，容量適中。', '["/images/product-17003-1758300024579-0.jpeg"]', 85, 6);
INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (17004, 'KB-MECH-RGB-01', '機械式電競鍵盤 RGB', '4718873459123', 3250, '採用高品質青軸，提供清脆的打擊手感。支援全鍵無衝突與可自訂 RGB 燈效。', '["/images/product-17004-1758299133370-0.jpeg"]', 100, 3);
INSERT INTO products (id, sku, name, ean13, price, description, imageUrls, imageSize, categoryId) VALUES (17005, 'BG-CANVAS-SIDE-KHA', '輕旅帆布側', '4715432109875', 1280, '耐磨帆布材質，搭配皮革點綴，多口袋設計方便收納隨身物品。', '["/images/product-17005-1758299230975-0.jpeg"]', 95, 5);
