// 用假的 Sheet 跑真的 GAS 程式碼，驗證權限、冪等、發號、欄位級更新等行為。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---- 假的 Sheet ----
class FakeSheet {
  constructor(name, grid) { this.name = name; this.grid = grid.map(r => r.slice()); }
  getDataRange() {
    const self = this;
    return { getValues: () => self.grid.map(r => r.slice()) };
  }
  getRange(row, col, numRows, numCols) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < (numRows || 1); r++) {
          const src = self.grid[row - 1 + r] || [];
          out.push(src.slice(col - 1, col - 1 + (numCols || 1)));
        }
        return out;
      },
      setValue(v) {
        while (self.grid.length < row) self.grid.push([]);
        const target = self.grid[row - 1];
        while (target.length < col) target.push('');
        target[col - 1] = v;
      },
    };
  }
  getLastRow() { return this.grid.length; }
  appendRow(arr) { this.grid.push(arr.slice()); }
  deleteRow(r) { this.grid.splice(r - 1, 1); }
}

let BOOK = {};
global.SpreadsheetApp = { getActive: () => ({ getSheetByName: n => BOOK[n] || null }) };

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  computeDigest: (_alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()),
  base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  getUuid: () => crypto.randomUUID(),
  formatDate: (d, _tz, _fmt) => {
    // 測試固定用 +08:00，格式與 nowIso_ 的 XXX 一致
    const t = new Date(d.getTime() + 8 * 3600 * 1000);
    const p = n => String(n).padStart(2, '0');
    const ymd = `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
    if (_fmt === 'yyyy-MM-dd') return ymd;
    return `${ymd}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+08:00`;
  },
};
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
global.ContentService = {
  MimeType: { JSON: 'JSON' },
  createTextOutput: s => ({ _s: s, setMimeType() { return this; } }),
};
let PROPS = {};
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => PROPS[k] || null }) };
global.Logger = { log: () => {} };

for (const f of ['Config', 'Repo', 'Auth', 'Api', 'KeyAdmin']) {
  const src = fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8');
  // .gs 檔的 const/function 在 GAS 是全域的，用 indirect eval 模擬
  (0, eval)(src.replace(/\bconst\s+([A-Z_]+)\s*=/g, 'globalThis.$1 ='));
}

const parse = res => JSON.parse(res._s);
module.exports = { FakeSheet, setBook: b => { BOOK = b; }, setProps: p => { PROPS = p; }, parse };
