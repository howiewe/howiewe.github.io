# 前端架構與 SSR

本專案前台採用原生 JavaScript 與模組化 CSS，結合 Cloudflare Edge HTMLRewriter 注入頁面內容與 SEO 標籤。以下記錄目前分工與限制；產品問題的進度集中在 [待辦](../../代辦/待辦.md)。

---

## 1. 邊緣 SSR 主路由 (`functions/[[path]].js`)

邊緣 Worker 攔截前台訪問請求，讀取靜態 HTML 模板後，透過 `HTMLRewriter` 動態注入資料庫內容、Meta 標籤與模態預渲染：

### HTMLRewriter 注入對應

| 選擇器 | 注入器 (Injector) | 注入內容與時機 |
|---|---|---|
| `#category-tree` | `SidebarInjector` | 左側分類樹，標記當前分類及祖先圖示；瀏覽器控制器另處理展開狀態 |
| `#homepage-categories` | `HomepageCategoriesInjector` | 首頁頂層分類卡片（含 D1 代表產品圖與 `size` 比例縮放） |
| `#featured-category-container` | `FeaturedCategoryInjector` | 探索大廳精選大卡片（含代表圖與 `size` 比例縮放） |
| `#category-grid-container` | `CategoryLobbyInjector` | 探索大廳分類卡片網格；分類選擇受下述篩選邏輯影響 |
| `#product-list` | `ProductListInjector` | 目錄頁初始產品列表與 alt；目前圖片 JSON 未解析，不能保證圖片及比例正常 |
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

主路由先跳過靜態資源、API 與公開 API，依路徑選擇模板。沒有 D1 綁定時交給靜態服務；查詢失敗會記錄錯誤，仍可能回傳未完整注入的模板，不是統一錯誤頁。首頁與探索大廳依賴 SSR，沒有等效的瀏覽器分類資料載入流程。

SSR 產品列表直接使用 D1 列，與已解析圖片的產品 API 不同；相關格式與已確認缺口見 [資料庫與儲存](../功能、資料與契約/資料庫與儲存.md)。首頁精選與大廳分類也有依「運動用品」「居家用品」名稱選取或排除的現行邏輯，不能當成可任意套用的通用分類元件。大廳先排除精選分類再交給注入器，但注入器又依「運動用品」父節點找子分類，可能漏掉該群子分類，見 [待辦 G](../../代辦/待辦.md#待辦-g)。

---

## 2. 前台客戶端模組架構 (`js/customer/`)

前台客戶端主要分工如下：

- **`js/customer/customer-app.js`**：
  - **頁面類型**：以 `catalog.html` 為基底的輕量級 SPA 互動。
  - **URL 與彈窗歷程**：點擊產品卡片以 `history.pushState({ isModal: true })` 開啟 Modal，URL 同步為 `/catalog/product/:id/:name`；站內關閉執行 `history.back()` 乾淨返回原分類 URL；外部直連關閉自動導向所屬分類。
  - **多層麵包屑與標題同步**：動態追溯父子分類祖先鏈，即時更新 `#breadcrumb-container` 與 `document.title`。
  - **Toolbar 工具列**：整合防抖搜尋、排序切換與單/雙欄網格檢視切換。
- **`js/customer/slider.js`**：
  - 商品詳情彈窗圖片輪播，主圖套用後台設定的 `size` 縮放比例，縮圖清單維持 100% 原始尺寸，支援滑動拖曳與點擊開啟燈箱。
- **`js/customer/lightbox.js`**：
  - 全螢幕大圖檢視元件，繼承圖片之 `size` 作為初始比例，支援雙指縮放 (Pinch-to-zoom)、滑鼠滾輪放大、手勢平移與 URL Hash (`#lightbox`) 返回鍵關閉。

目錄頁取得分類後，按目前 URL 呼叫產品 API，並重新渲染列表與詳情；不是直接接手 SSR 的同一份狀態。搜尋與排序保存在頁面記憶體，分頁使用 `?page=`，不是完整的 URL 查詢狀態還原。深淺色、檢視偏好及介面適用範圍見 [使用介面與內容](../使用介面與內容/使用介面與內容.md)。

---

## 3. SEO、圖片與導覽

SSR 改寫 title，並向 head 追加 description、canonical、OG、Twitter Cards 與 JSON-LD。靜態 HTML 原有的 description 未移除，現況可能產生重複描述標籤，不能視為已去重。

- **Canonical URL**：主路由決定網址，`seo.js` 負責輸出標籤。產品與分類詳情使用 ID 與編碼名稱，全產品頁使用 `/catalog`；首頁與大廳使用 `url.href`，仍可能保留查詢參數。
- **結構化資料 (JSON-LD)**：
  - 首頁：`SportsGoodsStore`（含電話、地址、描述）
  - 探索頁：`CollectionPage` + `BreadcrumbList`
  - 全部產品頁：`BreadcrumbList`（兩層：首頁 › 全部產品）
  - 分類目錄頁：`BreadcrumbList`（多層：首頁 › 產品分類 › [父分類 ›] 當前分類）
  - 產品詳情頁：`Product` Rich Snippet + `BreadcrumbList`（多層祖先鏈 + 產品名）
- **圖片短邊約束與比例縮放**：
  - 1:1 正方形透明圖片置於各類長寬比展示框時，容器採用 Flex 居中與 `overflow: hidden`，圖片以 `object-fit: contain` 受限於框框短邊，並以 `transform: scale(size / 100)` 呈現後台微調比例。
- **視覺麵包屑 HTML**：前台使用語意 `<nav id="breadcrumb-container">` 與 `<ol class="breadcrumb-trail">`，`aria-current="page"` 標記當前頁，樣式由 `components.css` 管理。
- **圖片 alt 語意**：`ProductListInjector` 接收 `categoryName`，輸出「`{分類} - {產品名}`」格式；分類卡片輸出「`光華工業 {分類名} 系列`」。
- **動態 Sitemap (`functions/sitemap.xml.js`)**：自動抓取 D1 所有分類與產品，產品條目附加 `<image:image>` 標籤讓 Google 圖片搜尋收錄，快取 24 小時。
- **Meta description**：產品頁取產品描述；分類頁優先使用分類描述，其他展示頁或缺少描述時使用主路由中的品牌與產品範圍文案，並非每個頁面都包含相同關鍵字。

---

## 4. 全站 JavaScript 模組目錄組織 (`js/`)

全站 JS 按職責分為四大專屬資料夾，全面標準化為 `/js/...` 路徑引用：

| 分類資料夾 | 模組檔案 | 職責說明 |
|---|---|---|
| **`js/customer/`** | `customer-app.js`<br>`slider.js`<br>`lightbox.js` | 前台型錄 SPA 主控制、輪播元件與大圖縮放燈箱 |
| **`js/admin/`** | `admin-app.js`<br>`category-manager.js`<br>`idb-cache.js` | 後台商品管理主控制、分類管理 Modal 與 IndexedDB 快取 |
| **`js/tools/`** | `batch-upload.js`<br>`print-catalog.js` | 批次建檔工作台 (CSV+圖片) 與 A4 PDF 型錄列印排版 |
| **`js/shared/`** | `theme.js`<br>`ui-utils.js`<br>`cropper-helper.js`<br>`category-utils.js` | 主題與 Toast 工具，以及尚未接入呼叫端的裁切佇列、分類輔助；不可只因檔案存在就認定全站共用 |

---

## 5. 模組化 CSS 樣式架構 (`css/`)

各頁依需求載入 CSS 模組；HTML 仍有 inline styles，JS 與 SSR 也會寫入圖片比例、尺寸與互動 transform。主題 token、固定列印樣式及已知落差見 [使用介面與內容](../使用介面與內容/使用介面與內容.md)。

| 模組 | 職責說明 | 載入頁面 |
|---|---|---|
| `base.css` | 全域設計 Token（顏色、陰影、圓角、字體）、深淺色切換、基礎 reset 與響應式容器 | **全頁面** |
| `layout.css` | 頁首 Header、導覽列、側邊欄分類樹、遮罩、深淺色切換圖示 | 除 `print` 外所有頁面 |
| `components.css` | 通用按鈕 (`.btn`)、Toast 提示、通用 Modal 彈窗骨架、表單元件、分頁器、**共用麵包屑樣式** | 除 `print` 外所有頁面 |
| `catalog.css` | 目錄頁工具列 (搜尋/排序)、產品卡網格 (單/雙欄)、產品詳情彈窗、輪播 Slider、Lightbox 燈箱 | `catalog.html`, `admin.html` |
| `index.css` | 首頁專屬：全螢幕沉浸式 Hero、分類卡片網格、骨架屏載入動畫、頁尾 | `index.html` |
| `lobby.css` | 探索大廳專屬：精選大卡片、母/子分類網格排版、麵包屑導覽 | `catalog-lobby.html` |
| `admin.css` | 後台管理專屬：批次建檔工作台、分類管理 Modal、圖片裁切與縮圖排序 | `admin.html`, `batch-upload.html` |
| `print-catalog.css` | A4 目錄產生器專用排版與列印樣式 | `print-catalog.html` |
