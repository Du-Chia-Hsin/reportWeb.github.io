/**
 * 金鑰驗證。
 *
 * Sheet 只存 SHA-256 雜湊（D-002），所以驗證方式是「把收到的明文算 hash
 * 再比對」，而不是查出金鑰來比。管理者也無法回查任何金鑰。
 */

/** 必須與 KeyAdmin.gs 的 hashKey_ 完全一致，否則所有金鑰都會驗不過。 */
function hashKey_(plain) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain)
  );
}

/**
 * 以明文金鑰查出廠商。
 * @return {{code:string, name:string}|null} 查不到或已停用一律回 null。
 */
function authVendor_(apiKey) {
  if (!apiKey) return null;

  const hash = hashKey_(String(apiKey));
  const keys = readTable_(SHEETS.KEYS);

  let vendorCode = null;
  for (let i = 0; i < keys.rows.length; i++) {
    const row = keys.rows[i];
    if (asText_(row['金鑰雜湊']) !== hash) continue;
    if (!isTrue_(row['啟用狀態'])) return null;   // 停用的金鑰視同無效
    vendorCode = asText_(row['廠商代碼']);
    break;
  }
  if (!vendorCode) return null;

  // 廠商必須同時存在於 Parties 且啟用，類別必須是「廠商」
  const parties = readTable_(SHEETS.PARTIES);
  for (let i = 0; i < parties.rows.length; i++) {
    const p = parties.rows[i];
    if (asText_(p['代碼']) !== vendorCode) continue;
    if (!isTrue_(p['啟用狀態'])) return null;
    if (asText_(p['類別']) !== '廠商') return null;
    return { code: vendorCode, name: asText_(p['名稱']) };
  }
  return null;
}

/**
 * 內部 CLI 用的 admin 金鑰。
 *
 * 存在指令碼屬性而非 Sheet —— 它的權限遠大於廠商金鑰（可讀寫全部、可刪除），
 * 不該和資料放在同一個地方。
 * 設定方式：Apps Script 編輯器 → 專案設定 → 指令碼屬性 → 新增 ADMIN_KEY_HASH，
 * 值為 admin 金鑰明文的 SHA-256 base64（可用下方 printAdminKeyHash 產生）。
 */
function isAdmin_(adminKey) {
  if (!adminKey) return false;
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY_HASH');
  if (!expected) return false;
  return hashKey_(String(adminKey)) === expected;
}

/**
 * 一次性工具：產生 admin 金鑰與其雜湊。
 * 在編輯器手動執行，把明文交給 CLI 設定檔、把雜湊填進指令碼屬性。
 */
function printAdminKeyHash() {
  const plain = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
  Logger.log('=== 只顯示這一次 ===');
  Logger.log('ADMIN_KEY 明文（存進內部 CLI 設定檔，勿進 repo）：' + plain);
  Logger.log('ADMIN_KEY_HASH（填進指令碼屬性）：' + hashKey_(plain));
}
