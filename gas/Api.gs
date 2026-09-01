/**
 * HTTP 進入點與各動作實作。
 *
 * 部署設定：執行身分「我」、具有存取權的使用者「任何人」。
 * 端點網址任何人都能呼叫，這是設計如此（D-002）——
 * 安全性來自「每個動作都驗金鑰」，不是來自沒人知道網址。
 */

// ---------------------------------------------------------------- 進入點

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    switch (p.action) {
      case 'list': return actionList_(p.apiKey);
      case 'pull': return actionPull_(p.adminKey);
      default:     return fail_(ERR.MISSING_FIELD, '未指定或不支援的 action');
    }
  } catch (err) {
    return fail_(ERR.INTERNAL, String(err));
  }
}

/**
 * 前端必須以 Content-Type: text/plain 送出。
 *
 * GAS 不處理 CORS preflight（OPTIONS），送 application/json 會觸發 preflight
 * 而被瀏覽器擋下，且錯誤訊息只會說 CORS，不會指向真正原因。
 * text/plain 屬於簡單請求不會 preflight，這裡照樣用 JSON.parse 解。
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return fail_(ERR.MISSING_FIELD, '缺少請求內容');
    }
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return fail_(ERR.INVALID_VALUE, '請求內容不是合法的 JSON');
    }

    switch (body.action) {
      case 'create': return actionCreate_(body.apiKey, body.payload);
      case 'update': return actionUpdate_(body.apiKey, body.payload);
      case 'ack':    return actionAck_(body.adminKey, body.uuids);
      case 'push':   return actionPush_(body.adminKey, body.rows);
      case 'purge':  return actionPurge_(body.adminKey, body.uuids);
      default:       return fail_(ERR.MISSING_FIELD, '未指定或不支援的 action');
    }
  } catch (err) {
    return fail_(ERR.INTERNAL, String(err));
  }
}

// ---------------------------------------------------------------- 序列化

/** 把一列議題轉成可回傳的純物件。Date 欄位轉成 yyyy-MM-dd 字串。 */
function serializeIssue_(row, headers) {
  const out = {};
  headers.forEach(function (h) {
    if (!h) return;
    out[h] = (row[h] instanceof Date) ? asText_(row[h]) : asText_(row[h]);
  });
  return out;
}

/** Options 分頁 → 前端可直接使用的選項物件。 */
function readOptions_() {
  const t = readTable_(SHEETS.OPTIONS);
  const col = function (name) {
    return t.rows.map(function (r) { return asText_(r[name]); })
                 .filter(function (v) { return v !== ''; });
  };
  // 影響等級帶簡稱與說明，前端顯示用；排序靠 P1~P4 本身
  const levels = [];
  t.rows.forEach(function (r) {
    const code = asText_(r['影響等級']);
    if (!code) return;
    levels.push({ code: code, label: asText_(r['等級簡稱']), desc: asText_(r['等級說明']) });
  });
  return {
    問題類型:   col('問題類型'),
    影響等級:   levels,
    目前狀態:   col('目前狀態'),
    參與方類別: col('參與方類別'),
  };
}

// ---------------------------------------------------------------- 廠商：讀取

function actionList_(apiKey) {
  const vendor = authVendor_(apiKey);
  if (!vendor) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');

  const issues = readTable_(SHEETS.ISSUES);
  const projects = readTable_(SHEETS.PROJECTS);

  // 可見議題：逐筆判斷 參與者 是否含此廠商代碼。精確相等，不做子字串比對 ——
  // 中文廠商名共用字太常見，子字串比對會讓不相干的廠商互相命中。
  const visible = issues.rows.filter(function (row) {
    return splitCodes_(row['參與者']).indexOf(vendor.code) !== -1;
  });

  const hasIssueIn = {};
  visible.forEach(function (row) { hasIssueIn[asText_(row['項目代碼'])] = true; });

  // 可見專案 = 有議題的專案 ∪ 參與廠商含此廠商的專案。
  // 後者是必要的：新廠商一筆議題都沒有，沒有它就永遠開不出第一筆。
  const projectList = [];
  projects.rows.forEach(function (p) {
    if (!isTrue_(p['啟用狀態'])) return;
    const code = asText_(p['項目代碼']);
    const canCreate = splitCodes_(p['參與廠商']).indexOf(vendor.code) !== -1;
    if (!canCreate && !hasIssueIn[code]) return;
    projectList.push({
      項目代碼: code,
      專案名稱: asText_(p['專案名稱']),
      設備名稱: asText_(p['設備名稱']),
      canCreate: canCreate,
    });
  });

  return ok_({
    vendor: vendor,
    projects: projectList,
    issues: visible.map(function (r) { return serializeIssue_(r, issues.headers); }),
    options: readOptions_(),
  });
}

// ---------------------------------------------------------------- 廠商：新增

function actionCreate_(apiKey, payload) {
  const vendor = authVendor_(apiKey);
  if (!vendor) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');
  if (!payload) return fail_(ERR.MISSING_FIELD, '缺少 payload');

  const required = ['UUID', '項目代碼', '問題類型', '影響等級', '內容'];
  for (let i = 0; i < required.length; i++) {
    if (!String(payload[required[i]] || '').trim()) {
      return fail_(ERR.MISSING_FIELD, '缺少必填欄位：' + required[i]);
    }
  }

  const projectCode = String(payload['項目代碼']).trim();

  // 該廠商能不能在這個專案開議題，由 Projects.參與廠商 決定
  const projects = readTable_(SHEETS.PROJECTS);
  const project = projects.rows.filter(function (p) {
    return asText_(p['項目代碼']) === projectCode && isTrue_(p['啟用狀態']);
  })[0];
  if (!project) return fail_(ERR.NOT_FOUND, '找不到專案：' + projectCode);
  if (splitCodes_(project['參與廠商']).indexOf(vendor.code) === -1) {
    return fail_(ERR.FORBIDDEN, '無權在此專案建立議題');
  }

  const options = readOptions_();
  if (options.問題類型.indexOf(String(payload['問題類型'])) === -1) {
    return fail_(ERR.INVALID_VALUE, '問題類型不在允許清單內');
  }
  const levelCodes = options.影響等級.map(function (l) { return l.code; });
  if (levelCodes.indexOf(String(payload['影響等級'])) === -1) {
    return fail_(ERR.INVALID_VALUE, '影響等級不在允許清單內');
  }

  return withLock_(function () {
    const issues = readTable_(SHEETS.ISSUES);
    const uuid = String(payload['UUID']).trim();

    // 冪等：同一個 UUID 重送不再建立第二筆，直接回傳既有的那筆。
    // 廠商網路不穩重送、或使用者連點兩下送出，都會走到這裡。
    const existing = issues.rows.filter(function (r) {
      return asText_(r['UUID']) === uuid;
    })[0];
    if (existing) {
      return ok_({
        UUID: uuid,
        議題編號: asText_(existing['議題編號']),
        duplicated: true,
      });
    }

    const now = nowIso_();
    const issueNo = nextIssueNo_(issues.rows, projectCode);

    const record = {
      UUID:         uuid,
      議題編號:      issueNo,
      項目代碼:      projectCode,
      問題類型:      String(payload['問題類型']),
      影響等級:      String(payload['影響等級']),
      內容:         String(payload['內容']),
      處理方式:      '',
      目前狀態:      '待確認',
      提出者:        vendor.code,      // 強制填自己，不採信前端
      提出者類別:    '廠商',
      責任單位:      '',
      參與者:        vendor.code,
      登錄時間:      now,
      最後更新時間:  now,
      預計完成日:    '',
      實際結案日:    '',
      備註:         String(payload['備註'] || ''),
      資料同步狀態:  'pending',
      資料同步時間:  '',
      最後異動來源:  '廠商',
    };

    issues.sheet.appendRow(buildRow_(issues, record));
    return ok_({ UUID: uuid, 議題編號: issueNo, duplicated: false });
  });
}

// ---------------------------------------------------------------- 廠商：更新

function actionUpdate_(apiKey, payload) {
  const vendor = authVendor_(apiKey);
  if (!vendor) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');
  if (!payload || !payload['UUID']) return fail_(ERR.MISSING_FIELD, '缺少 UUID');

  // 廠商只能改這兩欄。送其他欄位一律拒絕，不要安靜地忽略 ——
  // 安靜忽略會讓前端以為存檔成功。
  const patch = {};
  Object.keys(payload).forEach(function (k) {
    if (k === 'UUID') return;
    if (VENDOR_WRITABLE.indexOf(k) === -1) {
      patch['__forbidden__'] = k;
      return;
    }
    patch[k] = String(payload[k]);
  });
  if (patch['__forbidden__']) {
    return fail_(ERR.FORBIDDEN, '無權修改欄位：' + patch['__forbidden__']);
  }
  if (Object.keys(patch).length === 0) {
    return fail_(ERR.MISSING_FIELD, '沒有要更新的欄位');
  }

  return withLock_(function () {
    const issues = readTable_(SHEETS.ISSUES);
    const uuid = String(payload['UUID']).trim();
    const row = issues.rows.filter(function (r) {
      return asText_(r['UUID']) === uuid;
    })[0];
    if (!row) return fail_(ERR.NOT_FOUND, '找不到議題');

    if (splitCodes_(row['參與者']).indexOf(vendor.code) === -1) {
      return fail_(ERR.FORBIDDEN, '無權修改此議題');
    }

    patch['最後更新時間'] = nowIso_();
    patch['最後異動來源'] = '廠商';
    // 改過就要重新同步，否則內部資料庫不會知道這次異動
    patch['資料同步狀態'] = 'pending';

    // 只寫 patch 裡的欄位，不重寫整列 —— 這樣內部同時改別的欄位不會被蓋掉
    updateFields_(issues, row._row, patch);
    return ok_({ UUID: uuid, 最後更新時間: patch['最後更新時間'] });
  });
}

// ---------------------------------------------------------------- 內部 CLI

function actionPull_(adminKey) {
  if (!isAdmin_(adminKey)) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');

  const issues = readTable_(SHEETS.ISSUES);
  const pending = issues.rows.filter(function (r) {
    return asText_(r['資料同步狀態']) === 'pending';
  });
  return ok_({
    count: pending.length,
    rows: pending.map(function (r) { return serializeIssue_(r, issues.headers); }),
  });
}

function actionAck_(adminKey, uuids) {
  if (!isAdmin_(adminKey)) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');
  if (!uuids || !uuids.length) return fail_(ERR.MISSING_FIELD, '缺少 uuids');

  return withLock_(function () {
    const issues = readTable_(SHEETS.ISSUES);
    const wanted = {};
    uuids.forEach(function (u) { wanted[String(u).trim()] = true; });

    const now = nowIso_();
    const acked = [];
    issues.rows.forEach(function (row) {
      const uuid = asText_(row['UUID']);
      if (!wanted[uuid]) return;
      updateFields_(issues, row._row, {
        資料同步狀態: 'updated',
        資料同步時間: now,
      });
      acked.push(uuid);
    });
    return ok_({ acked: acked, missing: uuids.length - acked.length });
  });
}

/** 內部改動回寫雲端。存在的更新、不存在的新增。 */
function actionPush_(adminKey, rows) {
  if (!isAdmin_(adminKey)) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');
  if (!rows || !rows.length) return fail_(ERR.MISSING_FIELD, '缺少 rows');

  return withLock_(function () {
    const issues = readTable_(SHEETS.ISSUES);
    const byUuid = {};
    issues.rows.forEach(function (r) { byUuid[asText_(r['UUID'])] = r; });

    const now = nowIso_();
    const updated = [];
    const inserted = [];

    rows.forEach(function (incoming) {
      const uuid = String(incoming['UUID'] || '').trim();
      if (!uuid) return;

      const stamps = {
        最後更新時間: now,
        最後異動來源: '內部',
        資料同步狀態: 'updated',
        資料同步時間: now,
      };
      const existing = byUuid[uuid];

      if (existing) {
        const patch = {};
        Object.keys(incoming).forEach(function (k) {
          if (k === 'UUID') return;
          if (issues.index[k] === undefined) return;
          if (SERVER_OWNED.indexOf(k) !== -1 && k !== '參與者') return;
          patch[k] = incoming[k];
        });
        // 責任單位可能在這次回寫被指派，參與者要跟著補上（append-only）
        if (incoming['責任單位']) {
          patch['參與者'] = addCode_(existing['參與者'], String(incoming['責任單位']));
        }
        Object.keys(stamps).forEach(function (k) { patch[k] = stamps[k]; });
        updateFields_(issues, existing._row, patch);
        updated.push(uuid);
      } else {
        const record = {};
        issues.headers.forEach(function (h) {
          if (h) record[h] = incoming[h] !== undefined ? incoming[h] : '';
        });
        record['參與者'] = addCode_(
          addCode_(record['參與者'], String(incoming['提出者'] || '')),
          String(incoming['責任單位'] || '')
        );
        if (!record['登錄時間']) record['登錄時間'] = now;
        Object.keys(stamps).forEach(function (k) { record[k] = stamps[k]; });
        issues.sheet.appendRow(buildRow_(issues, record));
        inserted.push(uuid);
      }
    });

    return ok_({ updated: updated, inserted: inserted });
  });
}

/**
 * 清理雲端已結案舊資料。
 *
 * CLI 傳入「已確認存在於本地 SQLite」的 UUID 清單，GAS 這邊再驗一次三個條件。
 * 兩邊都檢查是刻意的：一旦從雲端刪掉就沒有第二份了，
 * 任何一邊漏檢都會造成資料永久消失。
 */
function actionPurge_(adminKey, uuids) {
  if (!isAdmin_(adminKey)) return fail_(ERR.INVALID_KEY, '金鑰無效或已停用');
  if (!uuids || !uuids.length) return fail_(ERR.MISSING_FIELD, '缺少 uuids');

  return withLock_(function () {
    const issues = readTable_(SHEETS.ISSUES);
    const wanted = {};
    uuids.forEach(function (u) { wanted[String(u).trim()] = true; });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const deletable = [];
    const refused = [];

    issues.rows.forEach(function (row) {
      const uuid = asText_(row['UUID']);
      if (!wanted[uuid]) return;

      if (asText_(row['資料同步狀態']) !== 'updated') {
        refused.push({ uuid: uuid, reason: '尚未同步' }); return;
      }
      if (asText_(row['目前狀態']) !== '已結案') {
        refused.push({ uuid: uuid, reason: '未結案' }); return;
      }
      const closed = row['實際結案日'];
      const closedDate = (closed instanceof Date) ? closed : new Date(asText_(closed));
      if (!closed || isNaN(closedDate.getTime())) {
        refused.push({ uuid: uuid, reason: '無實際結案日' }); return;
      }
      if (closedDate > cutoff) {
        refused.push({ uuid: uuid, reason: '結案未滿 30 天' }); return;
      }
      deletable.push({ uuid: uuid, row: row._row });
    });

    // 由下往上刪，否則刪除後下方列號會位移，刪到不該刪的那列
    deletable.sort(function (a, b) { return b.row - a.row; });
    deletable.forEach(function (d) { issues.sheet.deleteRow(d.row); });

    return ok_({
      deleted: deletable.map(function (d) { return d.uuid; }),
      refused: refused,
    });
  });
}
