# 資料 Schema 定案版 v3

Google Sheet、GAS API、內部 SQLite 三邊的共同依據。
**這份文件描述目標狀態**，Sheet 依此重構一次後即不再變動結構。

決策背景見 `docs/decisions.md`（D-001 部署、D-002 安全邊界、D-003 權限模型）。
v1 / v2 的演進過程在 git 歷史裡。

---

## 0. 全域約定

| 項目 | 決定 |
| --- | --- |
| Sheet 共用設定 | **限制存取**，永不開放連結。見 D-002 |
| Sheet 時區 | 明確設為 `Asia/Taipei`（檔案 → 設定 → 時區） |
| 系統時間欄 | ISO 8601 純文字，例 `2026-08-31T14:23:05+08:00`，儲存格格式設「純文字」 |
| 人工日期欄 | Sheet 日期格式 `yyyy-mm-dd` |
| 空值 | 留空白儲存格，不填 `-`、`N/A`、`無` |
| 標題列 | 一律第 1 列並凍結。**分頁上方不放儀表板區塊** |
| 代碼欄 | ASCII、不含空白與逗號、唯一、**永不重複使用** |

### 為什麼系統時間欄用純文字

Sheet 的日期儲存格經 GAS `getValues()` 會變成 JS `Date`，`JSON.stringify` 後轉成 UTC 字串，
寫回時又依 Sheet 時區重新解讀。一來一回容易差 8 小時，而同步機制正是靠時間先後判斷。
存 ISO 字串沒有這層轉換。`預計完成日` / `實際結案日` 是給人看與篩選的，維持日期格式。

### 為什麼不放儀表板區塊

舊版 `DFM_IssueList` 第 1~4 列有統計數字與圖例，導致標題列在第 5 列、
所有讀寫都要偏移，且 GAS 整表寫入時會覆蓋掉。
**統計改由前端即時計算**，就不會過期，也不佔資料表版面。

---

## 1. `Parties` — 參與方名冊

所有「人或單位」的唯一來源。`提出者`、`責任單位`、`參與者` 都引用它。

| 欄 | 欄位名 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- | --- |
| A | `代碼` | 文字 | ✅ | 主鍵。例 `DaoHe`、`AE01` |
| B | `名稱` | 文字 | ✅ | 顯示用。例 `稻禾`、`機構設計一課` |
| C | `類別` | 下拉 | ✅ | `廠商` / `內部` |
| D | `啟用狀態` | 核取方塊 | ✅ | |
| E | `備註` | 文字 | | |

初始內容（廠商代碼可自行調整，唯一要求是唯一且穩定）：

```
代碼	名稱	類別	啟用狀態	備註
DaoHe	稻禾	廠商	TRUE
KuanBao	寬寶	廠商	TRUE
HwaInn	華音	廠商	TRUE
YaSe	亞瑟	廠商	TRUE
AE01	AE01	內部	TRUE
```

**這張表是「權限比對代碼、不比對名稱」的基礎**（D-003）。
中文廠商名共用字太常見，比對名稱遲早出事。

---

## 2. `Keys` — 金鑰表

原 `Facilities`。**金鑰只綁廠商，不綁項目**（D-003）。

| 欄 | 欄位名 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- | --- |
| A | `廠商代碼` | 文字 | ✅ | 對應 `Parties.代碼`，類別必須是 `廠商` |
| B | `金鑰雜湊` | 文字 | ✅ | SHA-256 → base64。**不存明文**，見 D-002 |
| C | `金鑰提示` | 文字 | ✅ | 明文末 4 碼，例 `…6f4`。用來辨識是哪一把 |
| D | `啟用狀態` | 核取方塊 | ✅ | 取消勾選即停用，**不要刪列** |
| E | `產生日` | 日期 | ✅ | `yyyy-mm-dd` |
| F | `備註` | 文字 | | 重發原因記在這裡 |

金鑰明文格式：16 碼以上小寫英數（`a-z0-9`）。約 83 bits 熵，足夠，
不需要加長、不需要 salt、不需要 bcrypt（D-002）。

**現有四把金鑰必須全部重發** —— 它們曾在 Sheet 公開期間外洩。

---

## 3. `Projects` — 專案主檔

| 欄 | 欄位名 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- | --- |
| A | `項目代碼` | 文字 | ✅ | 主鍵。例 `DFM` |
| B | `專案名稱` | 文字 | ✅ | 例 `AB` |
| C | `設備名稱` | 文字 | | 例 `ME01`。見下方待確認 |
| D | `參與廠商` | 文字 | ✅ | 逗號分隔的廠商代碼，例 `DaoHe,YaSe` |
| E | `啟用狀態` | 核取方塊 | ✅ | |
| F | `備註` | 文字 | | |

初始內容：

```
項目代碼	專案名稱	設備名稱	參與廠商	啟用狀態	備註
DFM	AB	ME01	DaoHe	TRUE
DBP			KuanBao	TRUE
BGM			HwaInn	TRUE
ABG			YaSe	TRUE
```

### `參與廠商` 為什麼必要

寫這份規格時發現的缺口：**純參與制無法讓廠商開出第一筆議題。**

D-003 定義「看得到 = 是該議題的參與者」。但新廠商手上一筆議題都沒有，
所以看不到任何專案，也就無從新增 —— 雞生蛋問題。

因此拆成兩條規則：

| 問題 | 依據 |
| --- | --- |
| 看得到**哪些議題** | `IssueList.參與者` 含該廠商代碼（逐筆判斷） |
| 能在**哪些專案**開議題 | `Projects.參與廠商` 含該廠商代碼 |
| 看得到**哪些專案分頁** | 上述兩者的聯集 |

`參與廠商` 只管「能不能開新議題」，**不影響既有議題的可見性** ——
把廠商從 `參與廠商` 移除，他仍看得到自己參與過的舊議題，符合 D-003 的保留原則。

---

## 4. `Options` — 下拉選單來源

| A `問題類型` | B `影響等級` | C `等級簡稱` | D `等級說明` | E `目前狀態` | F `參與方類別` | G `同步狀態` | H `異動來源` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 結構議題 | P1 | 優先 | 優先處理 | 待確認 | 廠商 | pending | 廠商 |
| 設計風險 | P2 | 重要 | 下次會議前處理 | 處理中 | 內部 | updated | 內部 |
| 待補資料 | P3 | 一般 | 找時間處理 | 待驗證 | | | |
| 製程問題 | P4 | 待議 | 討論是否列入議題 | 已結案 | | | |
| 其他 | | | | 已取消 | | | |

### 影響等級存 `P1`~`P4`，不存 `P1_優先`

- **排序天然正確** —— 存中文的話「優先/重要/一般」字典序沒有意義
- **改中文說法不用動資料** —— 只改 `Options` 的 C、D 欄
- 顯示層用 C 欄（簡稱）或 D 欄（說明），視版面而定

### 資料驗證設定

`IssueList` 各欄 → 資料 → 資料驗證 → 「範圍中的清單」：

| IssueList 欄位 | 引用範圍 |
| --- | --- |
| `問題類型` | `Options!A2:A` |
| `影響等級` | `Options!B2:B` |
| `目前狀態` | `Options!E2:E` |
| `提出者類別` | `Options!F2:F` |
| `資料同步狀態` | `Options!G2:G` |
| `最後異動來源` | `Options!H2:H` |
| `提出者` / `責任單位` | `Parties!A2:A` |

---

## 5. `IssueList` — 議題主表（攤平，所有專案共用一張）

**20 欄，A~T。標題列第 1 列，資料從第 2 列開始。**

| 欄 | 欄位名 | 型別 | 必填 | 誰寫 | 說明 |
| --- | --- | --- | --- | --- | --- |
| A | `UUID` | 文字 | ✅ | 前端 | UUID v4，主鍵，**永不變更** |
| B | `議題編號` | 文字 | ✅ | GAS | `{項目代碼}_{3碼流水}`，例 `DFM_012` |
| C | `項目代碼` | 文字 | ✅ | GAS | 對應 `Projects.項目代碼`。**不要 parse `議題編號` 前綴取得** |
| D | `問題類型` | 下拉 | ✅ | 前端 | |
| E | `影響等級` | 下拉 | ✅ | 前端 | `P1`~`P4` |
| F | `內容` | 文字 | ✅ | 前端 | |
| G | `處理方式` | 文字 | | 雙方 | |
| H | `目前狀態` | 下拉 | ✅ | 雙方 | |
| I | `提出者` | 下拉 | ✅ | GAS | 代碼。廠商建立時強制填自己 |
| J | `提出者類別` | 下拉 | ✅ | GAS | 由 `Parties` 帶出 |
| K | `責任單位` | 下拉 | | 內部 | 代碼 |
| L | `參與者` | 文字 | ✅ | GAS | 逗號分隔代碼，**append-only**，見 D-003 |
| M | `登錄時間` | ISO 文字 | ✅ | GAS | |
| N | `最後更新時間` | ISO 文字 | ✅ | GAS | 每次異動刷新 |
| O | `預計完成日` | 日期 | | 內部 | |
| P | `實際結案日` | 日期 | | 內部 | 雲端清理條件用 |
| Q | `備註` | 文字 | | 雙方 | |
| R | `資料同步狀態` | 下拉 | ✅ | GAS/CLI | `pending` / `updated` |
| S | `資料同步時間` | ISO 文字 | | CLI | |
| T | `最後異動來源` | 下拉 | ✅ | GAS | `廠商` / `內部` |

**R、S、T 是系統欄位。** 建議整欄灰底，標題加註「請勿手動修改」。
人手改這三欄會直接打亂同步迴圈，而且很難察覺。

### `參與者` 的維護

GAS 在每次寫入時執行：

```javascript
function addParty(participants, code) {
  const list = participants ? participants.split(',') : [];
  if (code && list.indexOf(code) === -1) list.push(code);
  return list.join(',');
}
// 寫入時對 提出者 與 責任單位 各呼叫一次，永不移除既有代碼
```

### 權限判斷

```javascript
// 讀取：逐筆判斷
const visible = row.參與者.split(',').indexOf(vendorCode) !== -1;

// 建立：查 Projects
const canCreate = project.參與廠商.split(',').indexOf(vendorCode) !== -1;
```

一律**精確相等**，不做子字串比對（D-003）。

---

## 6. GAS API 契約

部署：執行身分「**我**」、具有存取權的使用者「**任何人**」。
正式網址 `https://script.google.com/macros/s/{DEPLOY_ID}/exec`。

### 通用回應

```json
{ "ok": true,  "data": ... }
{ "ok": false, "error": "INVALID_KEY", "message": "金鑰無效或已停用" }
```

錯誤碼：`INVALID_KEY` · `MISSING_FIELD` · `INVALID_VALUE` · `NOT_FOUND` ·
`FORBIDDEN` · `LOCK_TIMEOUT` · `INTERNAL`

**金鑰不存在與金鑰無權限一律回 `INVALID_KEY`**，不分開講 ——
區分開來等於告訴攻擊者哪些金鑰有效（D-002）。

### 廠商端 · 讀取

```
GET {EXEC_URL}?action=list&apiKey={encodeURIComponent(key)}
```

```json
{ "ok": true, "data": {
  "vendor": { "code": "DaoHe", "name": "稻禾" },
  "projects": [ { "項目代碼":"DFM", "專案名稱":"AB", "設備名稱":"ME01", "canCreate": true } ],
  "issues": [ { "UUID":"...", "議題編號":"DFM_006", "項目代碼":"DFM", ... } ],
  "options": { "問題類型":[...], "影響等級":[{"code":"P1","label":"優先","desc":"優先處理"}, ...] }
} }
```

`projects` 是「有議題的專案」∪「`參與廠商` 含此廠商的專案」。
前端用 `項目代碼` 分組成分頁，統計數字前端自己算。

`options` 一併回傳，前端就不必寫死選項，改 `Options` 分頁即全站生效。

### 廠商端 · 新增

```
POST {EXEC_URL}
Content-Type: text/plain

{ "apiKey":"...", "action":"create", "payload":{
    "UUID":"前端產生的 uuid v4",
    "項目代碼":"DFM",
    "問題類型":"結構議題",
    "影響等級":"P2",
    "內容":"...",
    "備註":""
} }
```

GAS 一律覆寫下列欄位，**不採信前端傳值**：
`議題編號`（鎖內算 MAX+1）、`提出者`（金鑰對應廠商）、`提出者類別`（`廠商`）、
`參與者`、`登錄時間`、`最後更新時間`、`資料同步狀態`（`pending`）、`最後異動來源`（`廠商`）。

並驗證 `項目代碼` 在該廠商的可建立清單內，否則回 `FORBIDDEN`。

### 廠商端 · 更新

```
{ "apiKey":"...", "action":"update", "payload":{ "UUID":"...", "處理方式":"..." } }
```

**只寫 payload 中出現的欄位，不寫整列。** 這是防覆蓋的關鍵：
廠商改 `處理方式`、內部同時改 `預計完成日`，兩邊都能保留。
只有兩人同時改同一格才會衝突，機率極低，因此不加 `版本號` 樂觀鎖。
若日後實際觀察到衝突，再升級。

廠商可寫欄位限定：`處理方式`、`備註`。其餘一律 `FORBIDDEN`。

### 內部 CLI

需另一把 admin 金鑰，**只存在內部伺服器，永不進前端與 repo**（D-002）。

```
GET  ?action=pull&adminKey=...        取回所有 資料同步狀態=pending 的列
POST action=ack   { uuids:[...] }     標記為 updated
POST action=push  { rows:[...] }      內部改動 upsert 回雲端，同步狀態維持 updated
POST action=purge                     執行清理規則
```

### 兩個必守的實作細節

**Content-Type 必須是 `text/plain`。** GAS 的 `doPost` 不處理 CORS preflight
（`OPTIONS`）。送 `application/json` 會觸發 preflight，瀏覽器直接擋下，
而且錯誤訊息是 CORS，不會指向真正原因。`text/plain` 屬於簡單請求不會 preflight，
GAS 照樣用 `JSON.parse(e.postData.contents)` 解。**明確寫死並加註解。**

**Service Lock。** 所有寫入包在 `LockService.getScriptLock()` 內，
`waitLock(10000)`，`finally` 必定 `releaseLock()`。
取鎖失敗回 `LOCK_TIMEOUT`，前端提示重試。

---

## 7. 雲端清理規則

```
資料同步狀態 = "updated"
AND 目前狀態  = "已結案"
AND 實際結案日 < TODAY() - 30
```

三條同時成立才可從雲端刪除，由內部 CLI 執行。
**刪除前必須確認該 UUID 已存在於本地 SQLite** —— 一旦刪掉就沒有第二份了。

---

## 8. 內部 SQLite

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
  participants  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  due_date      TEXT,
  closed_date   TEXT,
  remark        TEXT,
  last_source   TEXT,
  synced_at     TEXT,
  CHECK (impact_level IN ('P1','P2','P3','P4')),
  CHECK (status IN ('待確認','處理中','待驗證','已結案','已取消'))
);

CREATE INDEX idx_issues_project ON issues(project_code);
CREATE INDEX idx_issues_status  ON issues(status);
```

**沒有 `資料同步狀態` 欄是刻意的。** 那是雲端側的傳輸控制狀態；
本地是主資料庫，不需要記錄「自己有沒有同步到自己」。只留 `synced_at`。

### Idempotency

```sql
INSERT INTO issues (...) VALUES (...)
ON CONFLICT(uuid) DO UPDATE SET ... ;
```

即使「本地已更新但回寫 `updated` 失敗」，下一輪重抓同一筆會走 UPDATE 而非新增。
**前提是 UUID 由前端產生且永不變更** —— 若讓 GAS 產 UUID，重送會拿到新 UUID，保護失效。

### 同時寫入

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

寫入端只有每分鐘一次的 CLI 與內部 Web UI，這個量級 WAL 綽綽有餘，
**不需要換掉 SQLite**（PPT Issue 2 的結論）。

---

## 9. 重構步驟

1. **關閉 Sheet 共用**，改為「限制存取」
2. 新建 `Parties`、`Projects`、`Options` 三個分頁，貼上第 1、3、4 節的初始內容
3. `Facilities` 改名 `Keys`，依第 2 節重排欄位。**四把金鑰全部重發**，
   存 hash 與末 4 碼，不存明文
4. `DFM_IssueList` 改名 `IssueList`，**刪掉第 1~4 列的儀表板區塊**，
   依第 5 節重排欄位，貼上第 10 節的轉換後資料
5. 依第 4 節設定各欄資料驗證
6. R、S、T 欄設灰底，標題加註「請勿手動修改」

---

## 10. 現有資料轉換後

已完成的轉換：`稻禾`→`DaoHe`、`重要`→`P2` 等、
`登錄日期` 轉 ISO、新增 `項目代碼` 與 `參與者`。
完整可貼上的 TSV 見 `docs/migration-issuelist.tsv`。

`議題編號` 的 `DFM_009` 空號維持原樣。
**發號務必用 `MAX+1` 而非 `COUNT+1`**，否則會重新發出已用過的號。

---

## 11. 待確認

**一個專案會不會有多台設備？**

目前 `設備名稱` 放在 `Projects`，等於假設「一專案 = 一設備」，
這符合現有資料（DFM 只有 `ME01`）。

若一個專案會有多台設備，`設備` 必須改成 `IssueList` 的欄位
（每筆議題指明是哪台機器），並另建 `Devices` 分頁。
**這個改動在有大量資料後很痛，現在確認成本最低。**
