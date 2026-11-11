# API 與安全保護

API 由 Cloudflare Pages Functions 實作，共用 [資料層](../../../functions/_lib/db.js) 與 JSON 回應工具。路由與資料格式描述目前的跨端契約；變更時需核對呼叫端、部署策略及既有資料的影響，不代表永久固定技術選擇。

## 管理區與登入保護

管理首頁為 `/admin/`，批次建檔與型錄工具為 `/admin/batch-upload`、`/admin/print-catalog`，管理 API 位於同一管理區。靜態頁面放在 `admin/`；各頁共用同一組管理者權限。

Cloudflare Access 應用 `admin Panel` 以指定電子郵件 allow 策略保護 `kwanghwatw.pages.dev/admin*`，涵蓋三個頁面與管理 API；既有 `/api/*` 目標仍保留，但該後端入口已停用。未登入主網域管理區時，Access 先導向登入。

[根 middleware](../../../functions/_middleware.js) 同時辨識管理區的編碼、大小寫及斜線變體，透過 [登入驗證](../../../functions/_lib/access.js) 驗證 `Cf-Access-Jwt-Assertion`。驗證由 `jose` 檢查 RS256 簽章、可信 issuer、應用 audience、有效期限及必要 claims；缺少或無效憑證回傳 403，管理回應使用 `Cache-Control: no-store`。這層檢查也適用於未經主網域 Access 路由的部署別名，不能只靠另一個網址取得管理資料。

可信 issuer 與 audience 集中於 [Access 設定](../../../functions/_lib/access-policy.js)，是公開識別資料，不是密鑰。驗證金鑰只從該可信 issuer 的公開憑證端點取得；不採用請求自行指定的 issuer。重建 Access 應用或變更其 audience 時，須一併更新設定與隔離驗證。

對非 GET／HEAD／OPTIONS 的管理請求，若帶有 `Origin`，必須與請求網址同源，否則回傳 403；沒有 `Origin` 的請求仍須具備有效登入憑證。此檢查不取代欄位驗證，資料輸入規則的未完成範圍見 [資料與分類階層驗證](../../代辦/03-資料與分類階層驗證.md)。

原本根目錄的管理首頁、批次與型錄網址，由 [SSR 主路由](../../../functions/[[path]].js) 以 308 導向新管理網址，包含工具頁省略 `.html` 的入口；不再提供未受保護的舊工具頁副本。舊 [API 路由](../../../functions/api/[[path]].js) 對所有方法回傳 404，不轉送寫入；主網域的未登入請求仍可能先被既有 Access 規則導向登入。網域、路由或保護範圍變更時需重新核對，見 [建置、驗證與運維](../建置、驗證與運維/建置驗證與運維.md)。

## 管理 API：`/admin/api/*`

入口為 [管理路由](../../../functions/admin/api/[[path]].js)，在根 middleware 驗證通過後處理請求。

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| GET | `/admin/api/all-data` | 回傳扁平分類陣列，由前端組成樹 |
| GET | `/admin/api/products` | 依分類、搜尋、排序與分頁取得產品；`categoryIds` 啟用型錄查詢 |
| GET | `/admin/api/products/:id` | 回傳單一產品；找不到時為 404 |
| POST | `/admin/api/products` | JSON 產品資料，有 `id` 時更新，否則新增 |
| DELETE | `/admin/api/products/:id` | 先刪除產品資料，再嘗試清理關聯 R2 圖片 |
| POST | `/admin/api/categories` | JSON 分類資料，有 `id` 時更新，否則新增 |
| DELETE | `/admin/api/categories/:id` | 有子分類或關聯產品時回傳 400，否則刪除 |
| POST | `/admin/api/reorder-categories` | 接收含 `id`、`parentId`、`sortOrder` 的陣列，批次更新階層與排序 |
| PUT | `/admin/api/upload/:filename` | 將 Request Body 二進位串流寫入 R2，回傳 `url` 與 `key` |
| POST | `/admin/api/batch-create` | 接收 `{ products: [...] }` JSON，按分類路徑找出或新增分類後批次建立產品；不在伺服器解析 CSV 或接收圖片二進位 |

管理路由在分派前檢查 `D1_DB`、`IMAGE_BUCKET`、`R2_PUBLIC_URL`，即使讀取端點也需要這三個綁定。未匹配路徑或方法回傳 404；捕捉到的例外記錄於伺服器並回傳一般化的 500 錯誤，不回傳內部例外細節。輸入驗證目前分散在各處理函式，不能視為完整的資料驗證層。

## 公開唯讀 API：`/public/*`

入口為 [公開路由](../../../functions/public/[[path]].js)，只需要 `D1_DB`。環境檢查通過後，非 GET 請求回傳 405。

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| GET | `/public/all-data` | 公開讀取扁平分類陣列 |
| GET | `/public/products` | 共用管理 API 的產品查詢邏輯 |
| GET | `/public/products/:id` | 公開讀取單一產品 |

## 查詢與資料契約

- 分類回應為 `{ categories: [...] }`；階層由各列的 `parentId` 表達，按 `parentId`、`sortOrder` 排序。
- 一般產品列表回應為 `{ products, pagination }`，分頁資訊含目前頁、總頁數、總筆數與每頁筆數。`categoryId` 包含該分類及其後代；`search` 比對名稱、SKU 與條碼。
- 排序欄位使用 `price`、`name`、`createdAt`、`updatedAt` 白名單，方向只會產生 ASC 或 DESC。API 預設依更新時間遞減；前台會明確傳入價格遞增。
- `categoryIds` 是型錄工具的多分類查詢：只查指定 ID、按分類路徑與價格排列，最多回傳 500 筆，分頁物件改為 `isCatalogMode` 與實際筆數；它不是一般分頁模式，也不自動補齊後代分類。
- 產品 API 會將儲存的圖片 JSON 字串解析成物件陣列；一般產品寫入也接收物件陣列。批次建立接收 URL 字串陣列，再轉換成儲存格式。詳細格式及清理限制見 [資料庫與儲存](資料庫與儲存.md)。

## 輸出安全

產品與分類名稱、描述、SKU、價格及錯誤訊息依顯示用途當作資料處理。描述採純文字，不支援使用者提供 HTML 排版；分類描述在 SSR 與瀏覽器端均先轉義，再將換行轉成受控的 `<br>`。資料庫保存原始資料，不在儲存時預先進行 HTML 轉義。

[共用輸出工具](../../../js/shared/output-utils.js) 提供文字／HTML 屬性轉義、圖片 URL 協定檢查與有限正數的圖片比例處理。圖片顯示允許一般相對網址及 HTTP(S)；編輯、裁切與配對的圖片預覽才明確啟用 blob 或工具允許的點陣圖 data URL。URL 檢查後寫入 HTML 屬性仍須轉義；數值與文字處理也不互相代用。

[JSON-LD 注入器](../../../functions/_lib/injectors.js) 在 JSON 序列化後處理 HTML script 邊界字元，保留資料可被 JSON 解析的語意，避免資料提早結束標籤。[SEO](../../../functions/_lib/seo.js) 的 meta／canonical 屬性與圖片來源亦使用對應輸出處理。`ContentInjector` 接收的是程式組成的可信模板，不是可直接接收使用者 HTML 的清理器。

SSR 與瀏覽器各自負責輸出，新增模板、欄位或 URL 用途時仍須檢查實際使用情境；既有防護不等於可任意插入未處理資料。驗證入口與目前覆蓋範圍見 [建置、驗證與運維](../建置、驗證與運維/建置驗證與運維.md)。

## D1 查詢方式

現有查詢以 `prepare()` 建立敘述，有資料參數時使用 `bind()`；查詢條件、IN 佔位符與白名單排序會組合成 SQL 結構，不直接拼接使用者資料值。分頁的總數與資料查詢、分類排序及批次產品寫入使用 `db.batch()`，分類建立則依階層順序執行。擴充位置與驗證方式見 [開發規範](../開發規範/開發規範.md)。
