/**
 * Google Apps Script 後端的呼叫層。
 *
 * 端點網址公開在原始碼裡是設計如此（見 docs/decisions.md D-002）——
 * 瀏覽器要呼叫它就藏不住，而它的安全性來自「每個請求都驗金鑰」，
 * 不是來自沒人知道網址。金鑰由使用者輸入，永遠不寫在這裡。
 */

const GAS_URL =
  'https://script.google.com/macros/s/AKfycbyP7Ya0-ZWrzaNn96WO8CiRqidxDSUZBprLyr4ujiOgVAO4o1KLFva2b8wF2001KIj8/exec';

/** 後端回傳的錯誤碼對應到給使用者看的訊息。 */
const MESSAGES = {
  INVALID_KEY:   '金鑰無效或已停用，請確認後重新輸入。',
  MISSING_FIELD: '有必填欄位沒有填寫。',
  INVALID_VALUE: '有欄位的值不在允許範圍內。',
  NOT_FOUND:     '找不到這筆資料，可能已被移除。',
  FORBIDDEN:     '您沒有執行這個操作的權限。',
  LOCK_TIMEOUT:  '系統忙碌中，請稍候再試一次。',
  INTERNAL:      '系統發生錯誤，請稍後再試或聯絡窗口。',
};

export class ApiError extends Error {
  constructor(code, message) {
    super(message || MESSAGES[code] || '發生未知的錯誤。');
    this.code = code;
  }
}

/** 統一處理回應：後端一律回 {ok, data} 或 {ok:false, error, message}。 */
async function unwrap(response) {
  if (!response.ok) {
    throw new ApiError('INTERNAL', `伺服器回應 ${response.status}，請稍後再試。`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    // 通常代表 Apps Script 拋了未捕捉的例外，回傳的是錯誤頁而不是 JSON
    throw new ApiError('INTERNAL', '伺服器回應格式不正確，請聯絡窗口。');
  }
  if (!body.ok) throw new ApiError(body.error, MESSAGES[body.error]);
  return body.data;
}

function get(params) {
  const query = new URLSearchParams(params).toString();
  return fetch(`${GAS_URL}?${query}`).then(unwrap);
}

/**
 * Content-Type 必須是 text/plain。
 *
 * Apps Script 不處理 CORS preflight（OPTIONS）。送 application/json 會讓瀏覽器
 * 先發 preflight，被擋下之後只會看到 CORS 錯誤，完全不會指向真正的原因。
 * text/plain 屬於簡單請求，不觸發 preflight，後端照樣用 JSON.parse 解。
 *
 * 不要「順手」把這裡改成 application/json。
 */
function post(body) {
  return fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  }).then(unwrap);
}

/** 讀取此金鑰可見的全部資料：廠商、專案、議題、選項。 */
export function fetchAll(apiKey) {
  return get({ action: 'list', apiKey });
}

/**
 * 建立議題。
 *
 * UUID 由前端產生且永不變更 —— 這是整條同步鏈冪等性的前提。
 * 送出失敗後重試會帶同一個 UUID，後端認得出來，不會產生第二筆。
 */
export function createIssue(apiKey, payload) {
  return post({ apiKey, action: 'create', payload });
}

/** 更新議題。只送真的有改的欄位，後端就只寫那幾格，不會蓋掉別人的改動。 */
export function updateIssue(apiKey, uuid, changes) {
  return post({ apiKey, action: 'update', payload: { UUID: uuid, ...changes } });
}

/** UUID v4。老瀏覽器沒有 crypto.randomUUID 時退回 getRandomValues。 */
export function newUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;   // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;   // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
