# Apps Script

貼進與雲端 Sheet 繫結的 Apps Script 專案（Sheet → 擴充功能 → Apps Script）。
檔名不影響執行，但保持一致比較好對照。

| 檔案 | 內容 |
| --- | --- |
| `Config.gs` | 常數、共用工具、`withLock_` |
| `Repo.gs` | Sheet 存取層。欄位以標題名稱定位，不寫死欄號 |
| `Auth.gs` | 金鑰雜湊比對、admin 驗證 |
| `Api.gs` | `doGet` / `doPost` 與各動作 |
| `KeyAdmin.gs` | 金鑰產生、重發、停用。手動執行，不對外 |

## 首次設定

1. 五個 `.gs` 貼進專案
2. 執行 `printAdminKeyHash()`，把明文交給內部 CLI 設定檔、
   雜湊填進「專案設定 → 指令碼屬性 → `ADMIN_KEY_HASH`」
3. 執行 `generateKeys()` 產生廠商金鑰，從執行紀錄取得明文後交付廠商
4. 部署 → 新增部署作業 → 網頁應用程式
   - 執行身分：**我**
   - 具有存取權的使用者：**任何人**
5. 複製 `/exec` 網址填進前端

## 改版後重新部署

Apps Script 的網頁應用程式改版後**必須建立新版本**才會生效 ——
「部署 → 管理部署作業 → 編輯 → 版本選『新版本』」。
只存檔不部署，線上跑的還是舊的。`/exec` 網址不會變。

## 測試

```bash
node gas/test/run.js
```
