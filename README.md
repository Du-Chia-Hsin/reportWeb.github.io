# reportWeb.github.io

機台議題回報系統的**廠商端網頁**，部署於 GitHub Pages。

前端在 `vendor-portal/`。設計文件、Apps Script 後端、內部工具在私有 repo
`Du-Chia-Hsin/digitalMechReportSysDoc`。

## 為什麼是這樣切的

站台必須公開（廠商在外網用瀏覽器開），而免費版 GitHub Pages 要求 repo 公開。
本 repo 因此只放前端 —— **前端原始碼不含任何業務資料**，
廠商、專案、選項全部在執行時由 API 取得。

廠商名單、專案代碼、設備編號屬於商業機密，一律放私有 repo，
連測試假資料都不使用真實名稱。

## 公開在這裡是安全的

`vendor-portal/src/api.js` 裡的 Apps Script 端點網址是公開的，**這是設計如此**：
瀏覽器要呼叫它就藏不住，安全性來自後端每個請求都驗金鑰，不是來自沒人知道網址。

**金鑰永遠不寫進原始碼**，由使用者輸入，存在 `sessionStorage`（關閉分頁即清除）。

## 開發

```bash
cd vendor-portal
npm install
npm run dev
npm run build
npm run deploy    # 推到 gh-pages 分支
```

測試見 `vendor-portal/README.md`。
