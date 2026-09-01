# 廠商端 Portal

Vue 3 + Vite。部署到 GitHub Pages（`npm run deploy`，推到 `gh-pages` 分支）。

```bash
npm install
npm run dev       # 開發
npm run build     # 產生 dist/
npm run preview   # 本機預覽 dist（跑 e2e 前要先開著）
npm run test:e2e  # 端到端測試
```

## 結構

| 檔案 | 內容 |
| --- | --- |
| `src/api.js` | GAS 端點呼叫層。錯誤碼轉成給使用者看的中文訊息 |
| `src/App.vue` | 全部 UI |
| `src/style.css` | 全域樣式與配色 token |
| `e2e.mjs` | 端到端測試。攔截 GAS 端點，用假資料驅動真的 UI |

`e2e.mjs` 需要 `npm run preview` 在 4173 埠執行中。
攔截而非連真的後端，是為了讓成功路徑也能被測到 ——
否則沒有有效金鑰就只驗得到錯誤畫面。

## 兩件不要「順手」改掉的事

**`api.js` 的 POST 必須用 `Content-Type: text/plain`。**
Apps Script 不處理 CORS preflight，改成 `application/json` 會被瀏覽器擋下，
而且錯誤訊息只會說 CORS，不會指向真正的原因。

**GAS 端點網址公開在原始碼裡是設計如此**（見 `docs/decisions.md` D-002）。
瀏覽器要呼叫它就藏不住，安全性來自每個請求都驗金鑰。
**金鑰永遠不寫進原始碼**，由使用者輸入，存在 `sessionStorage`（關掉分頁即清除）。

## 換部署平台時

`vite.config.js` 的 `base` 目前是 `/reportWeb.github.io/`，
這是 GitHub Pages 專案站的路徑。改用 Cloudflare Pages / Netlify / Vercel 時要改回 `/`。
