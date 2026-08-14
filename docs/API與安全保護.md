# API 與安全保護

系統所有 API 均以 Cloudflare Functions 實作於 Edge Worker 邊緣端，並透過路由路徑區分權限。

---

## 1. 寫入型 API — `/api/*`
**保護方式**：由 **Cloudflare Access** 於邊緣強制認證（Zero Trust）。未通過認證的請求無法抵達程式碼層。

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/api/all-data` | 取得完整分類樹資料 |
| `GET` | `/api/products` | 分頁/條件查詢產品（支援分類、搜尋詞、排序） |
| `GET` | `/api/products/:id` | 取得單一產品完整資訊 |
| `POST` | `/api/products` | 新增或更新產品（Body 帶有 `id` 即為更新） |
| `DELETE` | `/api/products/:id` | 刪除產品及關聯 R2 圖片檔案 |
| `POST` | `/api/categories` | 新增或更新分類（Body 帶有 `id` 即為更新） |
| `DELETE` | `/api/categories/:id` | 刪除分類（須無子分類且無關聯產品） |
| `POST` | `/api/reorder-categories`| 批次更新分類排序順序 |
| `PUT` | `/api/upload/:filename` | 上傳圖片二進位串流至 R2 |
| `POST` | `/api/batch-create` | 批次解析 CSV 並大量建立產品 |

---

## 2. 唯讀公開 API — `/public/*`
**保護方式**：無需登入，任何人均可訪問。
**安全機制**：程式碼強制僅接受 `GET` 請求，非 `GET` 請求一律阻擋並回傳 `405 Method Not Allowed`。

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/public/all-data` | 公開讀取分類清單 |
| `GET` | `/public/products` | 前台分頁讀取產品列表 |
| `GET` | `/public/products/:id` | 前台讀取特定產品詳細資訊 |

---

## 3. SQL 查詢安全規範
- 全站所有 D1 操作**嚴格禁止字串拼接 SQL**。
- 所有查詢必須使用 D1 Prepared Statement：`db.prepare(...).bind(...)`。
- 多筆查詢使用 `db.batch([...])` 一次性發送，避免 N+1 查詢負擔。
