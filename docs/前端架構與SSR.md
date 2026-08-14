# 前端架構與 SSR

本專案前台採用原生 JavaScript (ES6+) 與模組化 CSS，結合 Cloudflare Edge HTMLRewriter 提供高效能 SSR（伺服器渲染）與完整的 SEO 優化。

---

## 1. 邊緣 SSR 主路由 (`functions/[[path]].js`)

邊緣 Worker 攔截前台訪問請求，讀取靜態 HTML 模板後，透過 `HTMLRewriter` 動態注入資料庫內容、Meta 標籤與模態預渲染：

### HTMLRewriter 注入對應

| 選擇器 | 注入器 (Injector) | 注入內容與時機 |
|---|---|---|
| `#category-tree` | `SidebarInjector` | 左側分類樹（標記當前分類 `active` 並自動展開父目錄） |
| `#homepage-categories` | `HomepageCategoriesInjector` | 首頁頂層分類卡片（含 D1 代表產品圖與 `size` 比例縮放） |
| `#featured-category-container` | `FeaturedCategoryInjector` | 探索大廳精選大卡片（含代表圖與 `size` 比例縮放） |
| `#category-grid-container` | `CategoryLobbyInjector` | 探索大廳全部分類卡片網格（含代表圖與 `size` 比例縮放） |
| `#product-list` | `ProductListInjector` | 目錄頁初始產品列表（首批 24 筆；套用 `size` 縮放與圖片 alt 語意） |
| `#breadcrumb-container` | `BreadcrumbInjector` | 視覺語意麵包屑 `<ol>`（全部產品、多層父子分類頁與產品頁） |
| `#category-description-container` | `ContentInjector` | 分類說明文字（有 description 時注入） |
| `#detail-modal-container` | `ProductDetailModalInjector` | 產品直連 SSR 預渲染：移除 `hidden` 保持彈窗開啟 |
| `#slider-wrapper` | `ProductSliderSSRInjector` | 產品直連 SSR 預渲染：主輪播大圖（套用後台 `size` 縮放） |
| `#detail-thumbnail-list` | `ProductThumbnailsSSRInjector` | 產品直連 SSR 預渲染：縮圖清單（100% 原始尺寸無縮小） |
| `#product-detail-info` | `ProductDetailInfoSSRInjector` | 產品直連 SSR 預渲染：標題、價格、分類、SKU 與 EAN-13 |
| `body` | `BodyModalClassInjector` | 產品直連 SSR 預渲染：加入 `modal-open` class |
| `title` | `TitleRewriter` | 頁面標題（動態代入產品名、分類名或全部產品） |
| `head` | `HeadRewriter` | Canonical 規範網址、Open Graph 與 Twitter Cards 標籤 |
| `head` | `StructuredDataInjector` | Schema.org 結構化資料（Product, CollectionPage, BreadcrumbList, SportsGoodsStore） |

---

## 2. 前台客戶端模組架構 (`js/customer/`)

前台客戶端採取高內聚、低耦合的模組化拆分：

- **`js/customer/customer-app.js`**：
  - **頁面類型**：以 `catalog.html` 為基底的輕量級 SPA 互動。
  - **URL 與彈窗歷程**：點擊產品卡片以 `history.pushState({ isModal: true })` 開啟 Modal，URL 同步為 `/catalog/product/:id/:name`；站內關閉執行 `history.back()` 乾淨返回原分類 URL；外部直連關閉自動導向所屬分類。
  - **多層麵包屑與標題同步**：動態追溯父子分類祖先鏈，即時更新 `#breadcrumb-container` 與 `document.title`。
  - **Toolbar 工具列**：整合防抖搜尋、排序切換與單/雙欄網格檢視切換。
- **`js/customer/slider.js`**：
  - 商品詳情彈窗圖片輪播，主圖套用後台設定的 `size` 縮放比例，縮圖清單維持 100% 原始尺寸，支援滑動拖曳與點擊開啟燈箱。
- **`js/customer/lightbox.js`**：
  - 全螢幕大圖檢視元件，繼承圖片之 `size` 作為初始比例，支援雙指縮放 (Pinch-to-zoom)、滑鼠滾輪放大、手勢平移與 URL Hash (`#lightbox`) 返回鍵關閉。
- **`js/shared/theme.js`**：
  - 以 `defer` 載入，根據 `localStorage.theme` 切換 `document.body` 之 `dark-mode` class。

---

## 3. SEO、圖片與導覽規範

所有 SEO 標籤（title / description / canonical / OG / JSON-LD）均由 SSR 動態注入，HTML 靜態檔只保留 Googlebot 冷快取時的最低限度 fallback，無硬編碼重複項。

- **Canonical URL**：每個頁面均由 `seo.js` 動態生成規範網址，注入 `<link rel="canonical">`，防止 URL 參數造成重複頁面。
- **結構化資料 (JSON-LD)**：
  - 首頁：`SportsGoodsStore`（含電話、地址、描述）
  - 探索頁：`CollectionPage` + `BreadcrumbList`
  - 全部產品頁：`BreadcrumbList`（兩層：首頁 › 全部產品）
  - 分類目錄頁：`BreadcrumbList`（多層：首頁 › 產品分類 › [父分類 ›] 當前分類）
  - 產品詳情頁：`Product` Rich Snippet + `BreadcrumbList`（多層祖先鏈 + 產品名）
- **圖片短邊約束與比例縮放**：
  - 1:1 正方形透明圖片置於各類長寬比展示框時，容器採用 Flex 居中與 `overflow: hidden`，圖片以 `object-fit: contain` 受限於框框短邊，並以 `transform: scale(size / 100)` 呈現後台微調比例。
- **視覺麵包屑 HTML**：全站統一語意 `<nav id="breadcrumb-container">` 與 `<ol class="breadcrumb-trail">`，`aria-current="page"` 標記當前頁，樣式由 `components.css` 統一管理。
- **圖片 alt 語意**：`ProductListInjector` 接收 `categoryName`，輸出「`{分類} - {產品名}`」格式；分類卡片輸出「`光華工業 {分類名} 系列`」。
- **動態 Sitemap (`functions/sitemap.xml.js`)**：自動抓取 D1 所有分類與產品，產品條目附加 `<image:image>` 標籤讓 Google 圖片搜尋收錄，快取 24 小時。
- **Meta description 關鍵字**：分類頁、目錄頁、大廳頁描述文案均含「乒乓球拍、羽球拍、跳繩、球棒、批發、外銷」等核心搜尋意圖詞。

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
| `components.css` | 通用按鈕 (`.btn`)、Toast 提示、通用 Modal 彈窗骨架、表單元件、分頁器、**共用麵包屑樣式** | 除 `print` 外所有頁面 |
| `catalog.css` | 目錄頁工具列 (搜尋/排序)、產品卡網格 (單/雙欄)、產品詳情彈窗、輪播 Slider、Lightbox 燈箱 | `catalog.html`, `admin.html` |
| `index.css` | 首頁專屬：全螢幕沉浸式 Hero、分類卡片網格、骨架屏載入動畫、頁尾 | `index.html` |
| `lobby.css` | 探索大廳專屬：精選大卡片、母/子分類網格排版、麵包屑導覽 | `catalog-lobby.html` |
| `admin.css` | 後台管理專屬：批次建檔工作台、分類管理 Modal (雙視圖平移)、圖片裁切與縮圖排序 | `admin.html`, `batch-upload.html` |
| `print-catalog.css` | A4 目錄產生器專用排版與列印樣式 | `print-catalog.html` |
