# 技術決策紀錄

每則記錄「決定了什麼」「為什麼」「什麼情況下該重新考慮」。
要改的時候先看「重新考慮的條件」，判斷當初的前提是否還成立。

---

## D-001　前端部署維持 GitHub Pages + 公開 repo

**日期**：2026-09-01
**狀態**：已定案
**對應**：PPT Issue 1「使用 github site 必須啟用 public 模式」

### 決定

廠商端 portal continue 用 GitHub Pages 部署，repo 維持 public。

### 理由

**站台本身無論如何都必須是公開的。** 廠商在外網用瀏覽器開，它就得是公開網際網路可達。
所以「public」的爭議點只在**原始碼**要不要公開，不是網站要不要公開。

**而原始碼公開不洩漏任何東西**，前提是照規格走：

- 金鑰由使用者手動輸入，不寫在程式裡
- GAS 的 `/exec` 網址知道了也沒用，每個請求都要通過金鑰查表
- 這正是從 `.exe` 改成 Web UI 的附帶好處 —— docx 原本擔心的「反組譯取得金鑰」風險，
  在這個架構下根本不存在，因為程式裡壓根沒有金鑰

唯一會出事的情況是**有人把金鑰 commit 進去**。這要靠 `.gitignore` 和 code review 擋，
跟 repo 公不公開無關 —— 私有 repo 一樣會外洩，只是晚一點被發現。

選它還有一個理由：少一個外部服務要維護。

### 已評估但未採用

| 平台 | 私有 repo 免費部署 | 未採用的原因 |
| --- | --- | --- |
| Cloudflare Pages | ✅ 頻寬無上限 | 目前沒有需要隱藏原始碼的理由 |
| Netlify | ✅ 每月 100GB | 同上 |
| Vercel | ✅ 個人用途 | 同上 |
| Claude Artifact | — | **技術上做不到**，見下 |

**Claude Artifact 為什麼不行**：Artifact 頁面跑在嚴格 CSP 下，`fetch` / `XHR` / `WebSocket`
打到任何外部主機一律被擋，而且是靜默失敗。portal 的全部工作就是呼叫 GAS，
這一步在該平台上做不了。此外觀看者需要 claude.ai 帳號，外部廠商不可能為此辦帳號。
Artifact 適合放**文件**（規格書、驗機報告、進度儀表板），不適合放產品。

### 重新考慮的條件

出現任一項就該重新評估，首選 Cloudflare Pages：

1. 公司政策明文禁止公開原始碼
2. 程式碼中開始出現不能公開的內容（內部主機名稱、專有演算法、客戶名單）
3. 需要自訂網域（GitHub Pages 也支援，但 Cloudflare 設定較單純）
4. 需要 preview deployment（PR 自動產生預覽網址）

### 連帶注意事項

- `vendor-portal/vite.config.js` 的 `base` 目前是 `/reportWeb.github.io/`，
  這是 GitHub Pages 專案站的路徑。**改用其他平台時要改回 `/`。**
- repo 是 public，`.gitignore` 必須擋掉 `.env`、任何 `*key*` 檔案。
