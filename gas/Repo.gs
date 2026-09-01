/**
 * Sheet 存取層。
 *
 * 欄位一律以「標題名稱」定位，不寫死欄號 ——
 * 這樣有人在 Sheet 上插入或搬動欄位時，程式不會安靜地讀到錯的資料。
 */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('找不到分頁：' + name);
  return sh;
}

/**
 * 讀整張表。
 * @return {{headers:string[], index:Object, rows:Object[], sheet:Sheet}}
 *         rows 每筆多一個 _row 屬性，記錄它在 Sheet 上的實際列號。
 */
function readTable_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length === 0) throw new Error(name + ' 分頁是空的');

  const headers = values[0].map(function (h) { return String(h).trim(); });
  const index = {};
  headers.forEach(function (h, i) { if (h) index[h] = i; });

  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    // 整列皆空的列跳過（使用者刪內容但沒刪列時會出現）
    if (raw.join('').trim() === '') continue;
    const obj = { _row: r + 1 };
    headers.forEach(function (h, i) { if (h) obj[h] = raw[i]; });
    rows.push(obj);
  }
  return { headers: headers, index: index, rows: rows, sheet: sh };
}

/** 讀出的儲存格可能是 Date 物件或數字，統一轉成字串比對用。 */
function asText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).trim();
}

function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/**
 * 只更新指定欄位，不重寫整列。
 *
 * 這是防覆蓋的關鍵（見 docs/schema-spec.md）：
 * 廠商改 處理方式、內部同時改 預計完成日，兩邊都能保留。
 * 若整列寫回，後送出的那方會把先送出的改動蓋掉。
 */
function updateFields_(table, rowNumber, patch) {
  Object.keys(patch).forEach(function (field) {
    const col = table.index[field];
    if (col === undefined) throw new Error('欄位不存在：' + field);
    table.sheet.getRange(rowNumber, col + 1).setValue(patch[field]);
  });
}

/** 依表頭順序組出一整列，缺的欄位留空白。 */
function buildRow_(table, obj) {
  return table.headers.map(function (h) {
    return (h && obj[h] !== undefined) ? obj[h] : '';
  });
}

/**
 * 產生下一個議題編號：{項目代碼}_{3碼流水}。
 *
 * 必須用 MAX+1 而非 COUNT+1 —— 現有資料是 006/007/008/010/011，
 * COUNT+1 會算出 006 而撞號。刪過資料的表一定會踩到這個。
 */
function nextIssueNo_(issues, projectCode) {
  let max = 0;
  issues.forEach(function (row) {
    if (asText_(row['項目代碼']) !== projectCode) return;
    const no = asText_(row['議題編號']);
    const m = no.match(/_(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return projectCode + '_' + ('00' + (max + 1)).slice(-3);
}
