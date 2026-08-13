# AGENTS.md — 光華工業產品目錄系統 · AI Agent 協作規則

> 本文件是 AI Agent（如 Gemini、Cursor、Claude 等）在本專案工作時的行為準則與技術參考。  
> 閱讀本文件後，應能理解整個系統架構並安全地進行修改。

---

## 1. 專案概述

**光華工業有限公司**產品目錄系統。部署於 **Cloudflare Pages**，以 **Cloudflare Functions (Edge Workers)** 處理 SSR 與 API，資料儲存於 **Cloudflare D1 (SQLite)**，圖片儲存於 **Cloudflare R2**。

### 對外存取架構

| 路徑前綴 | 說明 | 存取保護 |
|---|---|---|
| `/admin*` | 後台管理介面 | Cloudflare Access（需登入） |
| `/api/*` | 寫入型 API（增刪改） | Cloudflare Access（需登入） |
| `/public/*` | 唯讀公開 API | 無需認證 |
| `/catalog*`、`/` | 前台頁面（SSR） | 無需認證 |
| `/batch-upload.html`、`/print-catalog.html` | 工具頁面 | Cloudflare Access（同 admin） |

---

## 2. 專案檔案結構

```
howiewe.github.io/
├── functions/                        # Cloudflare Functions (Edge Worker)
│   ├── [[path]].js                   # SSR 主路由（/, /catalog*, /catalog/category）
│   ├── sitemap.xml.js                # 動態 Sitemap 產生器
│   ├── api/
│   │   └── [[path]].js               # 寫入型 API（需 CF Access 保護）
│   └── public/
│       └── [[path]].js               # 唯讀公開 API（無需認證）
├── vendor/                           # 第三方函式庫（本地化，不依賴 CDN）
│   ├── css/
│   │   └── cropper.min.css
│   └── js/
│       ├── JsBarcode.all.min.js
│       ├── Sortable.min.js
│       ├── cropper.min.js
│       ├── html2canvas.min.js
│       ├── jspdf.umd.min.js
│       └── papaparse.min.js
├── templates/
│   └── products_template_simple.csv  # 批次匯入用 CSV 範本
├── index.html                        # 首頁（品牌頁，SSR 注入 meta）
├── catalog.html                      # 產品目錄/詳情頁（SSR 注入產品列表）
├── catalog-lobby.html                # 分類總覽頁（SSR 注入分類卡片）
├── admin.html                        # 後台管理（需 CF Access）
├── batch-upload.html                 # 批次建檔工具（需 CF Access）
├── print-catalog.html                # PDF 目錄產生器（需 CF Access）
├── style.css                         # 全域樣式表（所有頁面共用）
├── theme.js                          # 深色/淺色模式切換（defer 載入）
├── script-admin.js                   # 後台管理邏輯
├── script-customer.js                # 前台客戶瀏覽邏輯
├── script-batch-upload.js            # 批次建檔邏輯
├── script-print-catalog.js           # 列印目錄邏輯
├── robots.txt                        # 搜尋引擎指示
├── package.json                      # 僅含 wrangler（本地開發工具）
├── .gitignore
├── D1資料庫結構.txt                    # 資料庫建立指令參考（文件，非程式碼）
├── command.txt                       # 常用 wrangler D1 查詢指令（文件）
└── AGENTS.md                         # 本文件
```

---

## 3. D1 資料庫 Schema

### `categories` 表

```sql
CREATE TABLE categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    parentId    INTEGER,           -- NULL 表示頂層分類
    sortOrder   INTEGER NOT NULL DEFAULT 0,
    description TEXT,              -- 用於 SEO meta description
    createdAt   TEXT NOT NULL,     -- ISO 8601 格式
    updatedAt   TEXT NOT NULL,
    FOREIGN KEY (parentId) REFERENCES categories(id)
);
```

### `products` 表

```sql
CREATE TABLE products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT UNIQUE,        -- 可為 NULL
    name        TEXT NOT NULL,
    ean13       TEXT,               -- 12 或 13 位數字字串
    price       REAL DEFAULT 0,
    description TEXT,
    imageUrls   TEXT,               -- JSON 字串：[{ url: string, size: number }]
    imageSize   INTEGER DEFAULT 90, -- 已廢棄，imageUrls 內的 size 為準
    categoryId  INTEGER,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL,
    FOREIGN KEY (categoryId) REFERENCES categories(id)
);
```

> **重要**：`imageUrls` 欄位儲存的是 **JSON 字串**，格式為物件陣列
> `[{ "url": "https://...", "size": 90 }, ...]`。
> 所有讀取處必須 `JSON.parse()`，所有寫入處必須 `JSON.stringify()`。

---

## 4. API 端點總覽

### 寫入型 API — `/api/*`（需 Cloudflare Access）

| 方法 | 路徑 | 功能 |
|---|---|---|
| `GET` | `/api/all-data` | 取得所有分類 |
| `GET` | `/api/products` | 分頁查詢產品（支援 categoryId、search、sortBy、order、page、limit） |
| `GET` | `/api/products/:id` | 取得單一產品 |
| `POST` | `/api/products` | 新增或更新產品（body 含 `id` 時為更新） |
| `DELETE` | `/api/products/:id` | 刪除產品及 R2 圖片 |
| `POST` | `/api/categories` | 新增或更新分類（body 含 `id` 時為更新） |
| `DELETE` | `/api/categories/:id` | 刪除分類（需無子分類及產品） |
| `POST` | `/api/reorder-categories` | 批次更新分類排序 |
| `PUT` | `/api/upload/:filename` | 上傳圖片至 R2（body 為圖片 binary） |
| `POST` | `/api/batch-create` | 批次匯入產品 |

### 唯讀公開 API — `/public/*`（無需認證）

| 方法 | 路徑 | 功能 |
|---|---|---|
| `GET` | `/public/all-data` | 取得所有分類 |
| `GET` | `/public/products` | 分頁查詢產品 |
| `GET` | `/public/products/:id` | 取得單一產品 |

> **安全原則**：`/public/*` 路由強制只接受 `GET`，任何非 GET 請求均回傳 405。

---

## 5. Cloudflare Function 環境變數

所有 Functions 均透過 `context.env` 存取以下綁定：

| 環境變數 | 類型 | 說明 |
|---|---|---|
| `D1_DB` | D1 Database Binding | 主資料庫 |
| `IMAGE_BUCKET` | R2 Bucket Binding | 圖片儲存（私有） |
| `R2_PUBLIC_URL` | Secret/Variable | R2 圖片公開存取的 Base URL |
| `ASSETS` | Static Asset Binding | 前端靜態檔案（Pages 自動提供） |

若任何必要環境變數缺失，API 應回傳 `500` 並附帶錯誤訊息。

---

## 6. SSR 機制說明

`functions/[[path]].js` 攔截前台頁面請求（`/`、`/catalog*`），執行以下流程：

1. 判斷請求路徑是否為靜態資源（含 `.`）或 API 路徑，是則直接 `next()` 放行。
2. 根據路徑決定要載入的 HTML 模板（`baseHtmlPath`）。
3. 查詢 D1 取得所需資料（分類、產品、隨機圖片等）。
4. 建立 `HTMLRewriter` 實例，使用各 `Injector` 類別將資料注入對應的 HTML 元素。
5. 回傳注入後的 HTML 回應。

### Rewriter 對應表

| Selector | Injector | 功能 |
|---|---|---|
| `#category-tree` | `SidebarInjector` | 注入左側分類樹（所有頁面） |
| `#homepage-categories` | `HomepageCategoriesInjector` | 注入首頁頂層分類卡片（含 DB 代表圖） |
| `#category-grid-container` | `CategoryLobbyInjector` | 注入分類總覽卡片 |
| `#featured-category-container` | `FeaturedCategoryInjector` | 注入精選分類區塊 |
| `#product-list` | `ProductListInjector` | 注入初始產品列表（前 24 筆） |
| `#category-description-container` | `ContentInjector` | 注入分類描述 |
| `title` | `TitleRewriter` | 注入頁面標題 |
| `head` | `HeadRewriter` | 注入 OG/Twitter meta tags |
| `head` | `StructuredDataInjector` | 注入 JSON-LD 結構化資料 |

---

## 7. 前端架構說明

### 頁面與腳本對應

| HTML 頁面 | 腳本 | 路由方式 |
|---|---|---|
| `index.html` | inline `<script>` | 首頁，fetch `/public/all-data` 動態更新分類連結 |
| `catalog.html` | `script-customer.js` | SPA-like，URL 為 `/catalog/product/:id/:name` |
| `catalog-lobby.html` | 無（純 SSR） | SSR 完全渲染，無前端 JS |
| `admin.html` | `script-admin.js` | fetch `/api/*` 進行 CRUD |
| `batch-upload.html` | `script-batch-upload.js` | 批次上傳與 CSV 匯入 |
| `print-catalog.html` | `script-print-catalog.js` | fetch `/api/*` 產生 PDF |

### 主題切換（`theme.js`）

- 以 `defer` 載入，DOM Ready 後執行
- 讀取 `localStorage.theme`（`'light'` / `'dark'`）
- 切換 `document.body` 的 `dark-mode` class
- 在含有 `.theme-toggle-placeholder` 的頁面自動注入按鈕 HTML
- 在已有靜態 `#theme-toggle` 的頁面（`batch-upload.html`）直接綁定事件

### URL 路由策略（`script-customer.js`）

- 產品詳情使用 `history.pushState` / `popstate` 模擬前端路由
- 直接訪問 `/catalog/product/:id/:name` 時，SSR 負責 meta 注入，前端偵測 URL 並開啟 Modal
- 直接訪問 `/catalog/category/:id/:name` 時，SSR 負責篩選對應分類產品

### IndexedDB 使用（`script-admin.js`）

- 僅快取 `categories` 資料（DB: `ProductCatalogDB_CF`，版本 2）
- 每次開啟後台時從 API 拉取最新分類並更新 IndexedDB
- **不**快取產品資料，產品直接從 API 即時讀取

---

## 8. 已知問題與技術債

### 🔴 死碼（Dead Code）

`functions/api/[[path]].js` 第 41–44 行存在不可達代碼（unreachable code）：

```js
case 'products':
    // ... 正確邏輯在此 ...
    break;
    // 以下三行永遠不會執行：
    if (method === 'GET') return await getPaginatedProducts(...);
    if (method === 'POST') return await createOrUpdateProduct(...);
    break;
```

這是重構後遺留的殘碼，**不影響現有功能**，但會造成混淆。

### 🟡 硬編碼業務邏輯

`functions/[[path]].js` 中有針對特定分類名稱的硬編碼邏輯：

- 第 46 行：`c.name === '運動用品'`（用於找精選分類的子分類）
- 第 264 行：`const featuredCategoryName = '運動用品'`（精選分類名稱）

若分類名稱變更，需同步修改這兩處。

### 🟡 `imageSize` 欄位廢棄

`products` 表的 `imageSize` 欄位已不再使用，實際大小儲存於 `imageUrls` JSON 中每個物件的 `size` 屬性。欄位保留為向下相容，新增產品時不需傳入。

### 🟡 CSS 引用路徑不一致

- `admin.html`、`batch-upload.html`、`print-catalog.html`：`href="style.css"`（相對路徑）
- `catalog.html`、`index.html`、`catalog-lobby.html`：`href="/style.css"`（絕對路徑）

在 Cloudflare Pages 上兩者均可正常運作，但建議統一使用絕對路徑 `/style.css`。

### 🟡 SVG `viewBox` 屬性

`admin.html` 中部分 SVG 的 `viewBox` 屬性值有誤（`viewBox="0 0 24"` 應為 `viewBox="0 0 24 24"`）。
不影響多數瀏覽器渲染，但不符合 SVG 規範。

### 🟡 `catalog-lobby.html` 使用未定義 CSS 變數

Inline CSS 使用了 `var(--surface-color)`、`var(--text-primary)`、`var(--text-secondary)`、
`var(--shadow-md)`、`var(--shadow-lg)`、`var(--border-radius-lg)` 等變數，
這些需在 `style.css` 中定義才能正常顯示（確認 `style.css` 有定義後可刪除此條目）。

---

## 9. AI Agent 行為準則

### 安全邊界（禁止操作）

- **不可更動 Functions 的 URL 路由結構**：已與 Cloudflare Access 策略綁定，路徑改變需同步更新 CF 設定。
- **不可刪除資料庫欄位**：新增欄位用 `ALTER TABLE`，不刪除現有欄位（向下相容）。
- **不可更改 `imageUrls` 的 JSON 格式**：所有讀寫必須維持 `[{ url: string, size: number }]` 格式。
- **不可在程式碼中加入 token 驗證**：`/api/*` 保護完全依賴 Cloudflare Access，自行加驗證可能造成雙重邏輯衝突。

### 安全規範

- 所有 SQL 查詢必須使用 D1 Prepared Statement（`.prepare(...).bind(...)`），**禁止字串拼接 SQL**。
- 動態 `IN (?)` 的佔位符數量必須與 binding 數量一致。

### 樣式修改

- 共用樣式寫入 `style.css`；頁面特定樣式寫在各 HTML 的 `<style>` 標籤內。
- 顏色、間距等設計 token 應使用 CSS 變數，不應硬編碼數值。

### 新增功能指引

- 新後台 API：加到 `functions/api/[[path]].js` 的 `switch` 內
- 新公開 API：加到 `functions/public/[[path]].js`
- 新 SSR 頁面：在 `functions/[[path]].js` 的路由判斷中新增分支
- 新第三方函式庫：下載到 `vendor/js/` 或 `vendor/css/`，**不使用外部 CDN**（Google Fonts 除外）

---

## 10. 開發環境與部署

### 本地開發

```bash
npm install          # 安裝 wrangler

# 本地預覽（需有 .dev.vars 設定 R2_PUBLIC_URL 等環境變數）
npx wrangler pages dev . --d1=D1_DB=<local-db-name>
```

### 部署

透過 **Cloudflare Pages Git 整合**自動部署：
- 推送至主分支 → 自動觸發部署
- **不需要 build 步驟**（純靜態 + Functions）
- `package.json` 僅含 `wrangler`，為本地開發工具，不參與生產部署

### D1 資料庫操作

```bash
# 遠端執行 SQL（完整建表指令見 D1資料庫結構.txt）
npx wrangler d1 execute product-catalog --remote --command="SELECT * FROM categories"
```

---

## 11. 精選分類說明（業務邏輯）

`catalog-lobby.html`（分類總覽頁）有一個**精選分類**區塊，目前硬編碼為「**運動用品**」：

1. 從 D1 取得所有分類後，找出名稱為「運動用品」的頂層分類
2. 查詢該分類及其所有子分類中的隨機一張產品圖片作為封面
3. 使用 `FeaturedCategoryInjector` 渲染精選區塊
4. 其餘分類（不含「運動用品」）渲染至一般分類卡片網格

若需修改精選分類，同步更新 `functions/[[path]].js` 中的：
- 第 46 行：`CategoryLobbyInjector` 建構子內的硬編碼名稱
- 第 264 行：`const featuredCategoryName` 常數
