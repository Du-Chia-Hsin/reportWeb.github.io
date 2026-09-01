# GAS 行為測試

用假的 Sheet 跑真的 `.gs` 程式碼，不需要連上 Google。
`harness.js` 以 Node 的 `crypto` 模擬 `Utilities.computeDigest`，
並提供 `SpreadsheetApp` / `LockService` / `ContentService` / `PropertiesService` 的替身。

```bash
node gas/test/run.js
```

失敗會以非零狀態碼結束。改動 `gas/*.gs` 後請重跑。

涵蓋範圍：金鑰驗證與停用、參與制可見性、建立與更新權限、
`MAX+1` 發號、同 UUID 重送的冪等、欄位級更新不覆蓋他人改動、
`參與者` append-only、清理規則的三條件、以及畸形輸入。
