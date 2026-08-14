# 前端架構與 SSR

本專案前台採用原生 JavaScript (ES6+) 與 CSS，結合 Cloudflare Edge HTMLRewriter 提供高效能 SSR（伺服器渲染）與完整的 SEO 優化。

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

## 2. 前端客戶端架構 (`script-customer.js`)

- **頁面類型**：以 `catalog.html` 為基底的輕量級 SPA-like 互動。
- **URL 狀態同步**：
  - 點擊產品卡片時以 `history.pushState` 開啟產品詳情 Modal，URL 更新為 `/catalog/product/:id/:name`。
  - 關閉 Modal 或點擊瀏覽器返回鍵（`popstate`）時恢復產品目錄狀態。
- **深淺色主題 (`theme.js`)**：
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
