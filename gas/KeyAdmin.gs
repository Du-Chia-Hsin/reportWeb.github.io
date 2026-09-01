/**
 * 金鑰管理工具 —— 在 Apps Script 編輯器中手動執行，不對外開放。
 *
 * 設計原則見 docs/decisions.md D-002：
 *   Sheet 只存 SHA-256 雜湊，永不存明文。
 *   明文只在產生的當下出現一次，之後任何人（含管理者）都無法回查。
 *
 * 欄位一律以標題名稱定位（同 Repo.gs）。寫死欄號的話，
 * Sheet 少一欄或多一欄就會安靜地寫到隔壁欄去。
 */

const KEY_FIELDS = ['廠商代碼', '金鑰雜湊', '金鑰提示', '啟用狀態', '產生日', '備註'];

/** 金鑰明文：24 碼十六進位（96 bits），來源是 Java 的強隨機數產生器。 */
function newPlainKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
}

function hashKey_(plain) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain)
  );
}

function today_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

/**
 * 開工前確認 Keys 分頁的欄位齊全。
 * 缺欄就直接停下來，不要「盡力寫寫看」—— 寫錯欄位比不寫危險得多。
 */
function assertKeySheet_() {
  const table = readTable_(SHEETS.KEYS);
  const missing = KEY_FIELDS.filter(function (f) {
    return table.index[f] === undefined;
  });
  if (missing.length) {
    throw new Error(
      SHEETS.KEYS + ' 分頁缺少欄位：' + missing.join('、') +
      '\n請先依 docs/schema-spec.md 第 2 節補上標題列，再重新執行。'
    );
  }
  return table;
}

/**
 * 為所有「金鑰雜湊」欄空白的廠商產生金鑰。
 * 已有雜湊的列不動，重跑安全。
 *
 * 執行後從「執行紀錄」讀取明文，逐一交付廠商後即可關閉 —— 之後查不到了。
 */
function generateKeys() {
  const table = assertKeySheet_();
  const issued = [];

  table.rows.forEach(function (row) {
    const vendor = asText_(row['廠商代碼']);
    if (!vendor) return;
    if (asText_(row['金鑰雜湊'])) return;   // 已有金鑰，不動

    const plain = newPlainKey_();
    updateFields_(table, row._row, {
      金鑰雜湊: hashKey_(plain),
      金鑰提示: '…' + plain.slice(-4),
      啟用狀態: true,
      產生日:   today_(),
    });
    issued.push(vendor + '\t' + plain);
  });

  if (!issued.length) {
    Logger.log('沒有需要產生金鑰的列（金鑰雜湊皆已填寫）。');
    Logger.log('要重發既有金鑰請用 rotateKey(廠商代碼, 原因)。');
    return;
  }

  Logger.log('=== 以下明文只顯示這一次，請立刻交付廠商 ===');
  issued.forEach(function (line) { Logger.log(line); });
  Logger.log('=== 交付後請關閉此紀錄。系統已無法回查這些值。 ===');
}

/** 在 Keys 分頁找出某廠商所在的列，找不到就丟例外。 */
function findKeyRow_(table, vendorCode) {
  const hit = table.rows.filter(function (r) {
    return asText_(r['廠商代碼']) === vendorCode;
  })[0];
  if (!hit) throw new Error(SHEETS.KEYS + ' 分頁找不到廠商代碼：' + vendorCode);
  return hit;
}

/**
 * 重發單一廠商的金鑰。舊金鑰立即失效。
 * @param {string} vendorCode 例 'DaoHe'
 * @param {string} reason     重發原因，寫入備註欄
 */
function rotateKey(vendorCode, reason) {
  if (!vendorCode) throw new Error('必須指定 vendorCode');

  const table = assertKeySheet_();
  const row = findKeyRow_(table, vendorCode);
  const plain = newPlainKey_();

  updateFields_(table, row._row, {
    金鑰雜湊: hashKey_(plain),
    金鑰提示: '…' + plain.slice(-4),
    啟用狀態: true,
    產生日:   today_(),
    備註:     today_() + ' 重發：' + (reason || '未註明原因'),
  });

  Logger.log('=== 明文只顯示這一次 ===');
  Logger.log(vendorCode + '\t' + plain);
}

/**
 * 一次重發所有廠商的金鑰。金鑰外洩時使用。
 * 與 generateKeys 不同：這支會覆寫已存在的金鑰。
 */
function rotateAllKeys(reason) {
  const table = assertKeySheet_();
  const issued = [];

  table.rows.forEach(function (row) {
    const vendor = asText_(row['廠商代碼']);
    if (!vendor) return;
    const plain = newPlainKey_();
    updateFields_(table, row._row, {
      金鑰雜湊: hashKey_(plain),
      金鑰提示: '…' + plain.slice(-4),
      啟用狀態: true,
      產生日:   today_(),
      備註:     today_() + ' 全面重發：' + (reason || '未註明原因'),
    });
    issued.push(vendor + '\t' + plain);
  });

  Logger.log('=== 以下明文只顯示這一次，請立刻交付各廠商 ===');
  issued.forEach(function (line) { Logger.log(line); });
  Logger.log('=== 交付後請關閉此紀錄。 ===');
}

/**
 * 停用金鑰但保留紀錄。廠商離場或疑似外洩時使用。
 * 不要直接刪列 —— 會失去稽核軌跡。
 */
function deactivateKey(vendorCode, reason) {
  const table = assertKeySheet_();
  const row = findKeyRow_(table, vendorCode);
  updateFields_(table, row._row, {
    啟用狀態: false,
    備註:     today_() + ' 停用：' + (reason || '未註明原因'),
  });
  Logger.log('已停用 ' + vendorCode);
}
