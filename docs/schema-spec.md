# 資料 Schema 定案版 v1

> 本文是 Google Sheet、GAS API、內部 SQLite 三邊的共同依據。
> 依據 `docs/data-model.md` 的現況快照 + `digitalMechReportSysDoc` 的架構圖與 docx 整理而成。
> 標示 **[假設]** 的項目是我先替你決定的，請在修 Sheet 時一併確認。

---

## 0. 全域約定

| 項目 | 決定 |
| --- | --- |
| Sheet 時區 | 明確設為 `Asia/Taipei`（檔案 → 設定 → 時區）。不設會用建立者所在時區，GAS 讀出來的時間會飄。 |
| 系統時間欄 | 存 **ISO 8601 純文字**，例 `2026-08-31T14:23:05+08:00`。欄位格式設「純文字」。 |
| 人工日期欄 | 存 **Sheet 日期格式** `yyyy-mm-dd`，方便人排序篩選。 |
| 空值 | 一律留空白儲存格，不要填 `-`、`N/A`、`無`。 |
| 標題列 | 第 1 列，並且**凍結**（檢視 → 凍結 → 1 列）。 |

### 為什麼系統時間欄用純文字

Sheet 的日期儲存格經過 GAS `getValues()` 會變成 JS `Date` 物件，再 `JSON.stringify` 會轉成 UTC 字串；寫回去時又依 Sheet 時區重新解讀。這一來一回很容易差 8 小時，而同步機制正是靠時間先後判斷的。存 ISO 字串就沒有這層轉換，代價只是 Sheet 上不能直接用日期函式算 —— 但這幾欄本來就不是給人算的。

`預計完成日` / `實際結案日` 是人在看、在篩的，維持日期格式；剛好雲端清理條件要拿 `實際結案日` 算 30 天，日期格式反而好寫。

---

## 1. 分頁 `Facilities` — 金鑰與權限對應

**一列 = 一張通行證。** 金鑰唯一，一把金鑰只對應一個項目。

| 欄 | 欄位名 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- | --- |
| A | `項目代碼` | 文字 | ✅ | `DFM` / `DBP` / `BGM`。權限過濾的唯一依據。 |
| B | `項目名稱` | 文字 | | 給人看的全名，例「數位化製造平台」。 |
| C | `廠商代碼` | 文字 | ✅ | `HeYu` / `KuanBao` / `HwaInn`。 |
| D | `廠商名稱` | 文字 | ✅ | `禾宇` / `寬寶` / `華音`。 |
| E | `專屬金鑰` | 文字 | ✅ | 見下方格式規定。**全表唯一**。 |
| F | `啟用狀態` | 核取方塊 | ✅ | 取消勾選 = 立即停用該金鑰，但保留紀錄。 |
| G | `金鑰產生日` | 日期 | | `yyyy-mm-dd` |
| H | `備註` | 文字 | | |

### 金鑰格式 **[假設]**

```
{項目代碼}_{廠商代碼}_{32碼亂數}
例：DFM_HeYu_4gd54g6sg46dfh54d89h46dr89w9t4
```

**亂數段請改用 URL-safe 字元集：`A-Z a-z 0-9 - _`**

現在的金鑰含 `+`，放進 URL query string 時 `+` 會被伺服器解讀成空白，若前端忘了 `encodeURIComponent` 就會驗證失敗，而且是那種偶爾才錯、很難查的 bug。換掉字元集比每個呼叫點都記得 encode 可靠。

金鑰前綴帶項目與廠商只是為了人工辨識方便，**GAS 絕對不可以靠解析前綴來判權限**，一定要查表 —— 否則偽造前綴就能越權。

### 一對多怎麼辦 **[假設]**

目前是「一項目 = 一廠商 = 一金鑰」。若之後一家廠商要負責兩個項目，**開兩列、發兩把金鑰**，不要讓一把金鑰跨項目。這符合 docx 風險 4 的權限最小化原則，GAS 的過濾邏輯也維持一行就寫完。代價是廠商要保管多把金鑰，但廠商本來就是一個項目一個窗口。

若你確定要一把金鑰跨多項目，告訴我，我改成 `可存取項目` 逗號分隔的設計。

---

## 2. 分頁 `IsuueList` — 議題主表

> 分頁名建議改拼字正確的 `IssueList`。若已經有東西接了，維持原樣也行，但程式裡要註明。

| 欄 | 欄位名 | 型別 | 必填 | 誰寫 | 說明 |
| --- | --- | --- | --- | --- | --- |
| A | `UUID` | 文字 | ✅ | 前端 | UUID v4。主鍵，**永不變更**。 |
| B | `議題編號` | 文字 | | GAS | 給人講的編號，`DFM-2026-0007`。 |
| C | `項目代碼` | 文字 | ✅ | GAS | **權限過濾欄**。由金鑰查表帶入，前端傳的值一律忽略。 |
| D | `問題類型` | 下拉 | ✅ | 前端 | 見 `Options` 分頁 |
| E | `影響等級` | 下拉 | ✅ | 前端 | 見 `Options` 分頁 |
| F | `內容` | 文字 | ✅ | 前端 | 自由文字 |
| G | `處理方式` | 文字 | | 雙方 | 自由文字 |
| H | `目前狀態` | 下拉 | ✅ | 雙方 | 見 `Options` 分頁 |
| I | `提出者` | 文字 | ✅ | 前端 | 人名或單位 |
| J | `提出者類別` | 下拉 | ✅ | GAS | `廠商` / `內部` |
| K | `責任單位` | 文字 | | 內部 | 例 `AE01` |
| L | `登錄時間` | 文字 | ✅ | GAS | ISO 8601 |
| M | `最後更新時間` | 文字 | ✅ | GAS | ISO 8601 |
| N | `預計完成日` | 日期 | | 內部 | `yyyy-mm-dd` |
| O | `實際結案日` | 日期 | | 內部 | `yyyy-mm-dd`。清理條件用。 |
| P | `備註` | 文字 | | 雙方 | |
| Q | `sync_status` | 下拉 | ✅ | GAS/CLI | `pending` / `updated` |
| R | `同步時間` | 文字 | | CLI | ISO 8601，最後一次成功同步 |
| S | `資料來源` | 下拉 | ✅ | GAS | `外網` / `內部` |

**Q、R、S 是系統欄位**，建議整欄設灰底並在標題列加註「請勿手動修改」。人手改這三欄會直接打亂同步迴圈。

### 相對現況的三個關鍵改動

**1. 新增 `項目代碼`（C 欄）—— 這是最重要的一欄**

現在的 `IsuueList` 沒有任何欄位能對回 `Facilities`，GAS 拿到金鑰後無從得知該回傳哪些列。`提出者` / `責任單位` 看似能擔這角色，但它們的值域是混的（`禾宇`、`AE01` 兩邊都出現），語意也是「誰提的 / 誰處理」而非「誰可見」。用它們當權限條件，遇到「禾宇提出、AE01 負責」這種列就無法判斷禾宇該不該看到。

拆開之後：`項目代碼` 管可見性，`提出者`/`責任單位` 純業務欄位。權限邏輯不會因為業務流程改變而破功。

**2. 新增 `sync_status`（Q 欄）—— 沒有它整個架構跑不起來**

架構圖的核心是「寫入標 `pending` → CLI 拉 `pending` → 更新本地 → 回寫 `updated`」。Sheet 目前沒這欄，這條迴圈無處落腳。

**3. `登錄日期` → `登錄時間`，加到秒**

只有日期無法判斷同步先後。同一天多筆進來，CLI 拉取順序就沒有依據，回寫衝突時也無從仲裁。

### 新增 `提出者類別`（J 欄）的理由

現況 `提出者` 欄同時出現「禾宇」（廠商）和「AE01」（內部單位代號），值域混在一起。多一欄標明類別，內部 UI 才能一眼分流，也才知道哪些列是廠商從外網寫進來的。這欄由 GAS 依金鑰來源自動填，不讓前端決定。

### `議題編號`（B 欄）值不值得做

好處是人可以用「DFM-0007 那件」溝通，UUID 沒辦法唸。做法是 GAS 在 Service Lock 內查該項目目前最大號 +1。因為已經有 Lock 了，不會有重號問題，成本很低。

若你覺得多餘，這欄可以砍，不影響任何機制。

---

## 3. 新增分頁 `Options` — 下拉選單來源

把選項集中一處，Sheet 的資料驗證直接引用這個範圍，GAS 也讀同一份做驗證，選項要增減只改一個地方。

| A `問題類型` | B `影響等級` | C `目前狀態` | D `提出者類別` | E `sync_status` | F `資料來源` |
| --- | --- | --- | --- | --- | --- |
| 結構議題 | 優先 | 待確認 | 廠商 | pending | 外網 |
| 設計風險 | 重要 | 處理中 | 內部 | updated | 內部 |
| 待補資料 | 一般 | 待驗證 | | | |
| 製程問題 | | 已結案 | | | |
| 其他 | | 已取消 | | | |

**[假設] 我補了這些值：**

- `問題類型` 原有 3 種，我加了「製程問題」「其他」。「其他」建議一定要留，否則廠商遇到分類不到的狀況會硬塞進錯的類別，資料就髒了。
- `影響等級` 三種都是實際觀察到的。**順序我定為 優先 > 重要 > 一般**，`優先` 最高。這個排序請確認 —— 「優先」和「重要」語感上很接近，之後要排序或做統計會分不清。若可以，改成 `高` / `中` / `低` 之類語意明確的分級會好很多。
- `目前狀態` 原本只看到「待確認」。我補的流程是 `待確認 → 處理中 → 待驗證 → 已結案`，另加 `已取消` 收無效議題。**其中 `已結案` 是必要的** —— docx 的雲端清理條件要靠它。

在 Sheet 設定資料驗證：選取 `IsuueList` D 欄 → 資料 → 資料驗證 → 條件選「範圍中的清單」→ 填 `Options!A2:A`。其餘欄比照。

---

## 4. 雲端清理規則

docx 指定的三個條件，對應到欄位：

```
sync_status = "updated"
AND 目前狀態 = "已結案"
AND 實際結案日 < TODAY() - 30
```

三條同時成立才可從雲端刪除。由內部 CLI 定期執行，**刪除前必須確認該 UUID 已存在於本地 SQLite**，否則資料會憑空消失。

---

## 5. GAS API 契約

### 通用回應格式

```json
{ "ok": true,  "data": ... }
{ "ok": false, "error": "INVALID_KEY", "message": "金鑰無效或已停用" }
```

錯誤碼：`INVALID_KEY` / `MISSING_FIELD` / `NOT_FOUND` / `FORBIDDEN` / `LOCK_TIMEOUT` / `INTERNAL`

### 廠商端（外網）

**讀取**
```
GET {EXEC_URL}?action=list&apiKey={encodeURIComponent(key)}
→ { "ok": true, "data": { "project_code": "DFM", "vendor_name": "禾宇", "rows": [ ... ] } }
```
只回傳 `項目代碼` 等於該金鑰所屬項目的列。

**新增**
```
POST {EXEC_URL}
Content-Type: text/plain            ← 關鍵，見下方說明
body: {
  "apiKey": "...",
  "action": "create",
  "payload": {
    "UUID": "前端產生的 uuid v4",
    "問題類型": "結構議題",
    "影響等級": "重要",
    "內容": "...",
    "提出者": "禾宇"
  }
}
→ { "ok": true, "data": { "UUID": "...", "議題編號": "DFM-2026-0007" } }
```

GAS 端一律覆寫這些欄位，不採信前端傳值：
`項目代碼`（由金鑰查表）、`提出者類別`（固定 `廠商`）、`登錄時間`、`最後更新時間`、`sync_status`（固定 `pending`）、`資料來源`（固定 `外網`）。

### 內部 CLI（需另一把 admin 金鑰，與廠商金鑰分開管理）

```
GET  ?action=pull&adminKey=...              取回所有 sync_status=pending 的列
POST action=ack   { uuids: [...] }          標記為 updated
POST action=push  { rows: [...] }           內部改動 upsert 回雲端，sync_status 維持 updated
POST action=purge                           執行第 4 節的清理規則
```

### 兩個實作上的雷

**Content-Type 必須是 `text/plain`**

GAS 的 `doPost` 不處理 CORS preflight（`OPTIONS`）請求。送 `application/json` 會觸發 preflight，瀏覽器直接擋下。用 `text/plain` 屬於簡單請求，不會 preflight，GAS 那邊照樣用 `JSON.parse(e.postData.contents)` 解。

現有 `App.vue` 的 `fetch` 沒設 `headers`，body 傳字串時瀏覽器預設就給 `text/plain`，所以剛好能動 —— 但這是碰巧，之後有人「順手」補上 `Content-Type: application/json` 就會壞，且錯誤訊息是 CORS，不會指向真正原因。**請明確寫死 `text/plain` 並加註解。**

**現有的 API 網址會過期**

`App.vue` 目前用的是：
```
https://script.googleusercontent.com/macros/echo?user_content_key=...
```
這是單次執行回傳的暫時網址。正式要用部署網址：
```
https://script.google.com/macros/s/{DEPLOY_ID}/exec
```
部署時「執行身分」選**我**，「具有存取權的使用者」選**任何人**。

### Service Lock

所有寫入操作包在 `LockService.getScriptLock()` 內，`waitLock(10000)`，`finally` 一定要 `releaseLock()`。這是 PPT Issue 1「同時寫入」的解法。取鎖失敗回 `LOCK_TIMEOUT`，前端提示重試即可。

---

## 6. 內部 SQLite

```sql
CREATE TABLE issues (
  uuid          TEXT PRIMARY KEY,
  issue_no      TEXT UNIQUE,
  project_code  TEXT NOT NULL,
  issue_type    TEXT NOT NULL,
  impact_level  TEXT NOT NULL,
  content       TEXT,
  resolution    TEXT,
  status        TEXT NOT NULL DEFAULT '待確認',
  reporter      TEXT,
  reporter_type TEXT,
  owner_unit    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  due_date      TEXT,
  closed_date   TEXT,
  remark        TEXT,
  source        TEXT,
  synced_at     TEXT,
  CHECK (impact_level IN ('優先','重要','一般')),
  CHECK (status IN ('待確認','處理中','待驗證','已結案','已取消'))
);

CREATE INDEX idx_issues_project ON issues(project_code);
CREATE INDEX idx_issues_status  ON issues(status);
```

**沒有 `sync_status` 欄是刻意的。** 那是雲端側的傳輸控制狀態，本地 SQLite 是主資料庫，不需要記錄「自己有沒有同步到自己」。本地只留 `synced_at` 表示這筆最後一次跟雲端對齊的時間。

### Idempotency

CLI 寫入一律用：
```sql
INSERT INTO issues (...) VALUES (...)
ON CONFLICT(uuid) DO UPDATE SET ... ;
```

這樣就直接解掉 docx 風險 1：即使「本地已更新但回寫 `updated` 失敗」，下一輪重抓同一筆，`ON CONFLICT` 會走 UPDATE 而非產生重複列。**前提是 UUID 由前端產生且永不變更** —— 如果讓 GAS 產 UUID，重送就會拿到新 UUID，這個保護就失效了。

### PPT Issue 2：SQLite 同時寫入

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

寫入端只有兩個：每分鐘一次的 CLI、內部 Web UI。這個量級 WAL 綽綽有餘，**不需要換掉 SQLite**。WAL 讓讀寫不互相阻塞，`busy_timeout` 讓偶發的寫入競爭自動重試而非直接拋 `SQLITE_BUSY`。

---

## 7. 尚未決定，需要你回答

**Q1. 廠商可以修改已送出的議題嗎？**

這題會改變設計。若廠商只能新增、不能改（改由內部處理），那目前設計就夠了。若廠商可以改，就會出現「廠商正在改第 7 列，內部同時也在改第 7 列」，需要加 `版本號` 欄做樂觀鎖，回寫時比對版本，不一致就拒絕並要求重讀。我先不加這欄，等你確認。

**Q2. `影響等級` 的「優先」和「重要」怎麼分？**

語感太接近，之後排序、統計、做儀表板都會卡。建議改成語意明確的分級。

**Q3. `責任單位` 的值域是什麼？**

`AE01` 是內部單位代號嗎？需不需要跟 `Facilities` 一樣獨立一張對照表？如果只是自由文字，之後統計會因為打字不一致而散掉。

**Q4. 內部 Web UI 的登入方式？**

架構圖寫「可看到所有權限資料」，但沒說怎麼驗身分。跟廠商一樣用金鑰？還是走公司既有的帳號系統？這會影響內部端要不要另外做一套權限。
