/**
 * 全域設定與共用工具。
 * 規格見 docs/schema-spec.md，決策背景見 docs/decisions.md。
 */

const TZ = 'Asia/Taipei';

const SHEETS = {
  ISSUES:   'IssueList',
  PROJECTS: 'Projects',
  PARTIES:  'Parties',
  KEYS:     'Keys',
  OPTIONS:  'Options',
};

/** 廠商可自行修改的欄位。其餘一律拒絕。 */
const VENDOR_WRITABLE = ['處理方式', '備註'];

/** 建立議題時，前端傳什麼都不採信、一律由伺服器決定的欄位。 */
const SERVER_OWNED = [
  '議題編號', '項目代碼', '提出者', '提出者類別', '參與者',
  '登錄時間', '最後更新時間', '資料同步狀態', '最後異動來源',
];

const ERR = {
  INVALID_KEY:   'INVALID_KEY',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_VALUE: 'INVALID_VALUE',
  NOT_FOUND:     'NOT_FOUND',
  FORBIDDEN:     'FORBIDDEN',
  LOCK_TIMEOUT:  'LOCK_TIMEOUT',
  INTERNAL:      'INTERNAL',
};

/**
 * ISO 8601 含時區位移，例 2026-09-01T14:23:05+08:00。
 * 必須用 XXX 而非 Z —— Z 會輸出 +0800（缺冒號），不是合法的 ISO 8601。
 */
function nowIso_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function ok_(data) {
  return json_({ ok: true, data: data });
}

function fail_(code, message) {
  return json_({ ok: false, error: code, message: message || '' });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 逗號分隔欄位 → 去空白的陣列。
 * 用於 參與者、參與廠商。
 */
function splitCodes_(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

/**
 * 把代碼加進逗號分隔清單，已存在則不動。永不移除既有代碼。
 * 這是 D-003 的 append-only 保證：有人誤改 責任單位 時，
 * 舊廠商仍保有讀取權，而不是丟失自己寫的處理方式。
 */
function addCode_(value, code) {
  const list = splitCodes_(value);
  if (code && list.indexOf(code) === -1) list.push(code);
  return list.join(',');
}

/** 所有寫入都必須包在這裡面，避免同時寫入造成資料損毀。 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return fail_(ERR.LOCK_TIMEOUT, '系統忙碌中，請稍後再試');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
