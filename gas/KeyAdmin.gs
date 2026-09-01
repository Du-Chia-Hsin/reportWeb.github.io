/**
 * 金鑰管理工具 —— 在 Apps Script 編輯器中手動執行，不對外開放。
 *
 * 設計原則見 docs/decisions.md D-002：
 *   Sheet 只存 SHA-256 雜湊，永不存明文。
 *   明文只在產生的當下出現一次，之後任何人（含管理者）都無法回查。
 */

const KEYS_SHEET = 'Keys';
const COL = { VENDOR: 1, HASH: 2, HINT: 3, ACTIVE: 4, ISSUED: 5, REMARK: 6 };

/** 金鑰明文格式：24 碼十六進位（96 bits），來源是 Java 的強隨機數產生器。 */
function newPlainKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
}

function hashKey_(plain) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain)
  );
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

/**
 * 為所有「金鑰雜湊」欄空白的廠商產生金鑰。
 * 已有雜湊的列不動，重跑安全。
 *
 * 執行後從「執行紀錄」讀取明文，逐一交付廠商後即可關閉 —— 之後查不到了。
 */
function generateKeys() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(KEYS_SHEET);
  if (!sheet) throw new Error('找不到 ' + KEYS_SHEET + ' 分頁');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error(KEYS_SHEET + ' 分頁沒有資料列');

  const rows = sheet.getRange(2, 1, lastRow - 1, COL.REMARK).getValues();
  const issued = [];

  rows.forEach(function (row, i) {
    const vendor = String(row[COL.VENDOR - 1]).trim();
    const hash = String(row[COL.HASH - 1]).trim();
    if (!vendor || hash) return;

    const plain = newPlainKey_();
    const r = i + 2;
    sheet.getRange(r, COL.HASH).setValue(hashKey_(plain));
    sheet.getRange(r, COL.HINT).setValue('…' + plain.slice(-4));
    sheet.getRange(r, COL.ACTIVE).setValue(true);
    sheet.getRange(r, COL.ISSUED).setValue(today_());
    issued.push({ vendor: vendor, plain: plain });
  });

  if (!issued.length) {
    Logger.log('沒有需要產生金鑰的列（金鑰雜湊皆已填寫）。');
    return;
  }

  Logger.log('=== 以下明文只顯示這一次，請立刻交付廠商 ===');
  issued.forEach(function (k) {
    Logger.log(k.vendor + '\t' + k.plain);
  });
  Logger.log('=== 交付後請關閉此紀錄。系統已無法回查這些值。 ===');
}

/**
 * 重發單一廠商的金鑰。舊金鑰立即失效。
 * @param {string} vendorCode 例 'DaoHe'
 * @param {string} reason     重發原因，寫入備註欄
 */
function rotateKey(vendorCode, reason) {
  if (!vendorCode) throw new Error('必須指定 vendorCode');

  const sheet = SpreadsheetApp.getActive().getSheetByName(KEYS_SHEET);
  const lastRow = sheet.getLastRow();
  const vendors = sheet.getRange(2, COL.VENDOR, lastRow - 1, 1).getValues();

  const idx = vendors.findIndex(function (v) {
    return String(v[0]).trim() === vendorCode;
  });
  if (idx === -1) throw new Error('Keys 分頁找不到廠商代碼：' + vendorCode);

  const r = idx + 2;
  const plain = newPlainKey_();
  sheet.getRange(r, COL.HASH).setValue(hashKey_(plain));
  sheet.getRange(r, COL.HINT).setValue('…' + plain.slice(-4));
  sheet.getRange(r, COL.ACTIVE).setValue(true);
  sheet.getRange(r, COL.ISSUED).setValue(today_());
  sheet.getRange(r, COL.REMARK)
       .setValue(today_() + ' 重發：' + (reason || '未註明原因'));

  Logger.log('=== 明文只顯示這一次 ===');
  Logger.log(vendorCode + '\t' + plain);
}

/**
 * 停用金鑰但保留紀錄。廠商離場或疑似外洩時使用。
 * 不要直接刪列 —— 會失去稽核軌跡。
 */
function deactivateKey(vendorCode, reason) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(KEYS_SHEET);
  const lastRow = sheet.getLastRow();
  const vendors = sheet.getRange(2, COL.VENDOR, lastRow - 1, 1).getValues();

  const idx = vendors.findIndex(function (v) {
    return String(v[0]).trim() === vendorCode;
  });
  if (idx === -1) throw new Error('Keys 分頁找不到廠商代碼：' + vendorCode);

  const r = idx + 2;
  sheet.getRange(r, COL.ACTIVE).setValue(false);
  sheet.getRange(r, COL.REMARK)
       .setValue(today_() + ' 停用：' + (reason || '未註明原因'));
  Logger.log('已停用 ' + vendorCode);
}
