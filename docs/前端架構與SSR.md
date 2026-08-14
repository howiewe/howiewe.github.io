# 前端架構與 SSR

本專案前台採用原生 JavaScript (ES6+) 與模組化 CSS，結合 Cloudflare Edge HTMLRewriter 提供高效能 SSR（伺服器渲染）與完整的 SEO 優化。

---

## 1. 邊緣 SSR 主路由 (`functions/[[path]].js`)

邊緣 Worker 攔截前台訪問請求，讀取靜態 HTML 模板後，透過 `HTMLRewriter` 動態注入資料庫內容與 Meta 標籤：

### HTMLRewriter 注入對應

| 選擇器 | 注入器 (Injector) | 注入內容與時機 |
|---|---|---|
| `#category-tree` | `SidebarInjector` | 左側分類樹（所有目錄頁面） |
| `#homepage-categories` | `HomepageCategoriesInjector` | 首頁頂層分類卡片（含 D1 代表產品圖） |
| `#featured-category-container` | `FeaturedCategoryInjector` | 探索大廳之精選大卡片（優先尋找運動用品，可 fallback） |
| `#category-grid-container` | `CategoryLobbyInjector` | 探索大廳之全部分類卡片網格 |
| `#product-list` | `ProductListInjector` | 目錄頁初始產品列表（首批 24 筆資料） |
| `title` | `TitleRewriter` | 頁面標題（動態代入產品名或分類名） |
| `head` | `HeadRewriter` | Canonical 規範網址、Open Graph 與 Twitter Cards 標籤 |
| `head` | `StructuredDataInjector` | Schema.org 結構化資料（Product, CollectionPage, BreadcrumbList, SportsGoodsStore） |

---

## 2. 前台客戶端模組架構 (`js/customer/`)

前台客戶端採取高內聚、低耦合的模組化拆分：

- **`js/customer/customer-app.js`**：
  - **頁面類型**：以 `catalog.html` 為基底的輕量級 SPA 互動。
  - **URL 狀態同步**：點擊產品卡片時以 `history.pushState` 開啟產品詳情 Modal，URL 同步為 `/catalog/product/:id/:name`；點擊返回鍵（`popstate`）或關閉 Modal 恢復目錄狀態。
  - **Toolbar 工具列**：整合防抖搜尋、排序切換與單/雙欄網格檢視切換。
- **`js/customer/slider.js`**：
  - 商品詳情彈窗專屬圖片輪播元件，支援 Touch 滑動、滑鼠拖曳、箭頭與圓點導航。
- **`js/customer/lightbox.js`**：
  - 全螢幕大圖檢視元件，支援雙指縮放 (Pinch-to-zoom)、滑鼠滾輪放大、手勢平移與 URL Hash (`#lightbox`) 返回鍵關閉。
- **`js/shared/theme.js`**：
  - 以 `defer` 載入，根據 `localStorage.theme` 切換 `document.body` 之 `dark-mode` class。

---

## 3. SEO 與 Sitemap 規範

- **Canonical URL**：每個頁面均動態生成規範網址，避免重複內容扣分。
- **結構化資料 (JSON-LD)**：
  - 首頁：`SportsGoodsStore` 商家資料
  - 探索頁：`CollectionPage` + `BreadcrumbList`
  - 產品目錄頁：特定分類之 `BreadcrumbList`
  - 產品詳情：`Product` Rich Snippet（含價格、條碼、在庫狀態、品牌與圖片）
- **動態 Sitemap (`functions/sitemap.xml.js`)**：自動抓取 D1 所有分類與產品生成 XML，快取 24 小時。

---

## 4. 全站 JavaScript 模組目錄組織 (`js/`)

全站 JS 按職責分為四大專屬資料夾，全面標準化為 `/js/...` 路徑引用：

| 分類資料夾 | 模組檔案 | 職責說明 |
|---|---|---|
| **`js/customer/`** | `customer-app.js`<br>`slider.js`<br>`lightbox.js` | 前台型錄 SPA 主控制、輪播元件與大圖縮放燈箱 |
| **`js/admin/`** | `admin-app.js`<br>`category-manager.js`<br>`idb-cache.js` | 後台商品管理主控制、分類管理 Modal (雙視圖平移) 與 IndexedDB 快取 |
| **`js/tools/`** | `batch-upload.js`<br>`print-catalog.js` | 批次建檔工作台 (CSV+圖片) 與 A4 PDF 型錄列印排版 |
| **`js/shared/`** | `theme.js`<br>`ui-utils.js`<br>`cropper-helper.js`<br>`category-utils.js` | 全站深淺色主題切換、Toast 提示通知、圖片裁切佇列與分類純字串輔助 |

---

## 5. 模組化 CSS 樣式架構 (`css/`)

系統採用職責單一、高內聚低耦合的模組化 CSS 設計，各頁面依需求按需載入，零 inline styles 依賴：

| 模組 | 職責說明 | 載入頁面 |
|---|---|---|
| `base.css` | 全域設計 Token（顏色、陰影、圓角、字體）、深淺色切換、基礎 reset 與響應式容器 | **全頁面** |
| `layout.css` | 頁首 Header、導覽列、側邊欄分類樹、遮罩、深淺色切換圖示 | 除 `print` 外所有頁面 |
| `components.css` | 通用按鈕 (`.btn`)、Toast 提示、通用 Modal 彈窗骨架、表單元件、分頁器 | 除 `print` 外所有頁面 |
| `catalog.css` | 目錄頁工具列 (搜尋/排序)、產品卡網格 (單/雙欄)、產品詳情彈窗、輪播 Slider、Lightbox 燈箱 | `catalog.html`, `admin.html` |
| `index.css` | 首頁專屬：全螢幕沉浸式 Hero、分類卡片網格、骨架屏載入動畫、頁尾 | `index.html` |
| `lobby.css` | 探索大廳專屬：精選大卡片、母/子分類網格排版、麵包屑導覽 | `catalog-lobby.html` |
| `admin.css` | 後台管理專屬：批次建檔工作台、分類管理 Modal (雙視圖平移)、圖片裁切與縮圖排序 | `admin.html`, `batch-upload.html` |
| `print-catalog.css` | A4 目錄產生器專用排版與列印樣式 | `print-catalog.html` |
