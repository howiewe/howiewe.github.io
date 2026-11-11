# API 與安全保護

API 由 Cloudflare Pages Functions 實作，共用 [資料層](../functions/_lib/db.js) 與 JSON 回應工具。路由與資料格式描述目前的跨端契約；變更時需核對呼叫端、部署策略及既有資料的影響，不代表永久固定技術選擇。

## 管理 API：`/api/*`

入口為 [管理路由](../functions/api/[[path]].js)，程式內沒有額外 Token 驗證。已透過 Cloudflare API 核對目前的 Access 應用 `admin Panel`：目標為 `kwanghwatw.pages.dev/admin*` 與 `kwanghwatw.pages.dev/api/*`，使用指定電子郵件的 allow 策略。

該帳號目前列出的 Access 應用未包含 `/batch-upload.html` 與 `/print-catalog.html`，兩頁不能宣稱受到同一層頁面保護；其資料請求仍使用受保護的管理 API。以上為設定核對，未以未登入瀏覽器實測登入或繞過效果。變更路由或網域時需重新核對對應策略，見 [建置、驗證與運維](建置驗證與運維.md)。

| 方法 | 路徑 | 行為 |
| --- | --- | --- |
| GET | `/api/all-data` | 回傳扁平分類陣列，由前端組成樹 |
| GET | `/api/products` | 依分類、搜尋、排序與分頁取得產品；`categoryIds` 啟用型錄查詢 |
| GET | `/api/products/:id` | 回傳單一產品；找不到時為 404 |
| POST | `/api/products` | JSON 產品資料，有 `id` 時更新，否則新增 |
| DELETE | `/api/products/:id` | 先刪除產品資料，再嘗試清理關聯 R2 圖片 |
| POST | `/api/categories` | JSON 分類資料，有 `id` 時更新，否則新增 |
| DELETE | `/api/categories/:id` | 有子分類或關聯產品時回傳 400，否則刪除 |
| POST | `/api/reorder-categories` | 接收含 `id`、`parentId`、`sortOrder` 的陣列，批次更新階層與排序 |
| PUT | `/api/upload/:filename` | 將 Request Body 二進位串流寫入 R2，回傳 `url` 與 `key` |
| POST | `/api/batch-create` | 接收 `{ products: [...] }` JSON，按分類路徑找出或新增分類後批次建立產品；不在伺服器解析 CSV 或接收圖片二進位 |

管理路由在分派前檢查 `D1_DB`、`IMAGE_BUCKET`、`R2_PUBLIC_URL`，即使讀取端點也需要這三個綁定。未匹配路徑或方法回傳 404；捕捉到的例外回傳 500。輸入驗證目前分散在各處理函式，不能視為完整的資料驗證層。

## 公開唯讀 API：`/public/*`

入口為 [公開路由](../functions/public/[[path]].js)，只需要 `D1_DB`。環境檢查通過後，非 GET 請求回傳 405。

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

## D1 查詢方式

現有查詢以 `prepare()` 建立敘述，有資料參數時使用 `bind()`；查詢條件、IN 佔位符與白名單排序會組合成 SQL 結構，不直接拼接使用者資料值。分頁的總數與資料查詢、分類排序及批次產品寫入使用 `db.batch()`，分類建立則依階層順序執行。擴充位置與驗證方式見 [開發規範](開發規範.md)。
