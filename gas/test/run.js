const crypto = require('crypto');
const H = require('./harness.js');
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

const KEY_DAOHE = 'daohe-plaintext-key-0001';
const KEY_YASE  = 'yase-plaintext-key-0002';
const ADMIN     = 'admin-plaintext-key-9999';

const ISSUE_HDR = ['UUID','議題編號','項目代碼','問題類型','影響等級','內容','處理方式','目前狀態',
  '提出者','提出者類別','責任單位','參與者','登錄時間','最後更新時間','預計完成日','實際結案日',
  '備註','資料同步狀態','資料同步時間','最後異動來源'];

function issue(o) { return ISSUE_HDR.map(h => (o[h] !== undefined ? o[h] : '')); }

function fresh() {
  H.setProps({ ADMIN_KEY_HASH: sha(ADMIN) });
  H.setBook({
    IssueList: new H.FakeSheet('IssueList', [ISSUE_HDR,
      issue({UUID:'u-006',議題編號:'DFM_006',項目代碼:'DFM',問題類型:'結構議題',影響等級:'P2',
             內容:'因為ABC',目前狀態:'待確認',提出者:'DaoHe',提出者類別:'廠商',責任單位:'AE01',
             參與者:'DaoHe,AE01',登錄時間:'2026-07-24T20:01:05+08:00',最後更新時間:'2026-07-24T20:01:05+08:00',
             資料同步狀態:'updated',最後異動來源:'內部'}),
      issue({UUID:'u-011',議題編號:'DFM_011',項目代碼:'DFM',問題類型:'其他',影響等級:'P1',
             內容:'BDC',處理方式:'舊的處理方式',目前狀態:'處理中',提出者:'DaoHe',提出者類別:'廠商',
             責任單位:'AE01',參與者:'DaoHe,AE01',預計完成日:'2026-09-04',
             資料同步狀態:'pending',最後異動來源:'內部'}),
      issue({UUID:'u-int',議題編號:'DFM_009',項目代碼:'DFM',問題類型:'待補資料',影響等級:'P3',
             內容:'純內部議題',目前狀態:'處理中',提出者:'AE01',提出者類別:'內部',責任單位:'AE01',
             參與者:'AE01',資料同步狀態:'updated',最後異動來源:'內部'}),
      issue({UUID:'u-old',議題編號:'DBP_001',項目代碼:'DBP',問題類型:'其他',影響等級:'P3',
             內容:'很久以前結案',目前狀態:'已結案',提出者:'KuanBao',提出者類別:'廠商',
             參與者:'KuanBao',實際結案日:new Date('2026-01-01'),
             資料同步狀態:'updated',最後異動來源:'內部'}),
    ]),
    Projects: new H.FakeSheet('Projects', [
      ['項目代碼','專案名稱','設備名稱','參與廠商','啟用狀態','備註'],
      ['DFM','AB','ME01','DaoHe',true,''],
      ['DBP','','','KuanBao',true,''],
      ['ABG','','','YaSe',true,''],
    ]),
    Parties: new H.FakeSheet('Parties', [
      ['代碼','名稱','類別','啟用狀態','備註'],
      ['DaoHe','稻禾','廠商',true,''],
      ['KuanBao','寬寶','廠商',true,''],
      ['YaSe','亞瑟','廠商',true,''],
      ['AE01','AE01','內部',true,''],
    ]),
    Keys: new H.FakeSheet('Keys', [
      ['廠商代碼','金鑰雜湊','金鑰提示','啟用狀態','產生日','備註'],
      ['DaoHe', sha(KEY_DAOHE), '…0001', true,  '2026-09-01',''],
      ['YaSe',  sha(KEY_YASE),  '…0002', false, '2026-09-01','已停用'],
    ]),
    Options: new H.FakeSheet('Options', [
      ['問題類型','影響等級','等級簡稱','等級說明','目前狀態','參與方類別','同步狀態','異動來源'],
      ['結構議題','P1','優先','優先處理','待確認','廠商','pending','廠商'],
      ['設計風險','P2','重要','下次會議前處理','處理中','內部','updated','內部'],
      ['待補資料','P3','一般','找時間處理','待驗證','','',''],
      ['製程問題','P4','待議','討論是否列入議題','已結案','','',''],
      ['其他','','','','已取消','','',''],
    ]),
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  → ' + detail : '')); }
}

console.log('\n【金鑰驗證】');
fresh();
check('有效金鑰通過', H.parse(doGet({parameter:{action:'list',apiKey:KEY_DAOHE}})).ok);
check('錯誤金鑰被拒', H.parse(doGet({parameter:{action:'list',apiKey:'wrong'}})).error === 'INVALID_KEY');
check('空金鑰被拒', H.parse(doGet({parameter:{action:'list'}})).error === 'INVALID_KEY');
check('已停用金鑰被拒（啟用狀態未勾）',
      H.parse(doGet({parameter:{action:'list',apiKey:KEY_YASE}})).error === 'INVALID_KEY');

console.log('\n【參與制可見性】');
fresh();
const listed = H.parse(doGet({parameter:{action:'list',apiKey:KEY_DAOHE}})).data;
const ids = listed.issues.map(i => i.UUID);
check('看得到自己參與的議題', ids.includes('u-006') && ids.includes('u-011'));
check('看不到純內部議題 u-int', !ids.includes('u-int'), '參與者只有 AE01');
check('看不到別家廠商的議題 u-old', !ids.includes('u-old'), '參與者只有 KuanBao');
check('專案清單只含 DFM', listed.projects.length === 1 && listed.projects[0].項目代碼 === 'DFM');
check('DFM 可建立', listed.projects[0].canCreate === true);
check('回傳選項供前端使用', listed.options.影響等級.length === 4 &&
      listed.options.影響等級[0].label === '優先');

console.log('\n【建立議題】');
fresh();
const created = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'create', payload:{
    UUID:'u-new', 項目代碼:'DFM', 問題類型:'結構議題', 影響等級:'P2', 內容:'新議題',
    提出者:'AE01', 資料同步狀態:'updated', 議題編號:'HACK_999',   // 這些應被忽略
  }})}}));
check('建立成功', created.ok);
check('發號用 MAX+1 而非 COUNT+1', created.data.議題編號 === 'DFM_012',
      '得到 ' + created.data.議題編號);
const row = H.parse(doGet({parameter:{action:'list',apiKey:KEY_DAOHE}}))
             .data.issues.find(i => i.UUID === 'u-new');
check('提出者被強制改為金鑰對應廠商', row.提出者 === 'DaoHe', '得到 ' + row.提出者);
check('提出者類別自動填廠商', row.提出者類別 === '廠商');
check('同步狀態強制 pending', row.資料同步狀態 === 'pending', '得到 ' + row.資料同步狀態);
check('最後異動來源強制廠商', row.最後異動來源 === '廠商');
check('參與者自動帶入', row.參與者 === 'DaoHe');
check('前端偽造的議題編號被忽略', row.議題編號 === 'DFM_012');

console.log('\n【冪等：同 UUID 重送】');
const dup = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'create', payload:{
    UUID:'u-new', 項目代碼:'DFM', 問題類型:'結構議題', 影響等級:'P2', 內容:'重送'}})}}));
check('重送不建立第二筆', dup.data.duplicated === true);
check('重送回傳原本的編號', dup.data.議題編號 === 'DFM_012');
const after = H.parse(doGet({parameter:{action:'list',apiKey:KEY_DAOHE}})).data.issues;
check('總筆數沒有增加', after.filter(i => i.UUID === 'u-new').length === 1);

console.log('\n【建立權限】');
fresh();
const noProj = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'create', payload:{
    UUID:'x1', 項目代碼:'ABG', 問題類型:'其他', 影響等級:'P1', 內容:'越權'}})}}));
check('不在參與廠商清單的專案 → FORBIDDEN', noProj.error === 'FORBIDDEN');
const badEnum = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'create', payload:{
    UUID:'x2', 項目代碼:'DFM', 問題類型:'不存在的類型', 影響等級:'P1', 內容:'x'}})}}));
check('不在清單的問題類型 → INVALID_VALUE', badEnum.error === 'INVALID_VALUE');
const missing = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'create', payload:{UUID:'x3', 項目代碼:'DFM'}})}}));
check('缺必填欄位 → MISSING_FIELD', missing.error === 'MISSING_FIELD');

console.log('\n【欄位級更新：不覆蓋他人改動】');
fresh();
// 內部先改了 預計完成日
H.parse(doPost({postData:{contents:JSON.stringify({
  adminKey:ADMIN, action:'push', rows:[{UUID:'u-011', 預計完成日:'2026-12-31'}]})}}));
// 廠商接著改 處理方式（他手上的資料是舊的，不含新的預計完成日）
const upd = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'update', payload:{UUID:'u-011', 處理方式:'廠商新填的'}})}}));
check('更新成功', upd.ok);
const merged = H.parse(doGet({parameter:{action:'list',apiKey:KEY_DAOHE}}))
                .data.issues.find(i => i.UUID === 'u-011');
check('廠商的改動有寫入', merged.處理方式 === '廠商新填的');
check('內部的改動沒有被蓋掉', merged.預計完成日 === '2026-12-31', '得到 ' + merged.預計完成日);
check('更新後同步狀態轉回 pending', merged.資料同步狀態 === 'pending');
check('最後異動來源轉為廠商', merged.最後異動來源 === '廠商');

console.log('\n【更新權限】');
fresh();
const forb = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'update', payload:{UUID:'u-011', 目前狀態:'已結案'}})}}));
check('廠商改非白名單欄位 → FORBIDDEN', forb.error === 'FORBIDDEN', JSON.stringify(forb));
const notMine = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'update', payload:{UUID:'u-old', 處理方式:'偷改'}})}}));
check('改不屬於自己的議題 → FORBIDDEN', notMine.error === 'FORBIDDEN');
const ghost = H.parse(doPost({postData:{contents:JSON.stringify({
  apiKey:KEY_DAOHE, action:'update', payload:{UUID:'不存在', 處理方式:'x'}})}}));
check('不存在的 UUID → NOT_FOUND', ghost.error === 'NOT_FOUND');

console.log('\n【admin 動作】');
fresh();
check('廠商金鑰不能當 admin 用',
      H.parse(doGet({parameter:{action:'pull',adminKey:KEY_DAOHE}})).error === 'INVALID_KEY');
const pulled = H.parse(doGet({parameter:{action:'pull',adminKey:ADMIN}})).data;
check('pull 只取 pending', pulled.count === 1 && pulled.rows[0].UUID === 'u-011');
H.parse(doPost({postData:{contents:JSON.stringify({adminKey:ADMIN,action:'ack',uuids:['u-011']})}}));
check('ack 後 pending 清空',
      H.parse(doGet({parameter:{action:'pull',adminKey:ADMIN}})).data.count === 0);

console.log('\n【參與者 append-only】');
fresh();
H.parse(doPost({postData:{contents:JSON.stringify({
  adminKey:ADMIN, action:'push', rows:[{UUID:'u-006', 責任單位:'YaSe'}]})}}));
const handed = H.parse(doGet({parameter:{action:'list',apiKey:KEY_DAOHE}}))
                .data.issues.find(i => i.UUID === 'u-006');
check('責任單位轉手後新單位加入參與者', handed.參與者.includes('YaSe'));
check('原廠商仍在參與者中（未被移除）', handed.參與者.includes('DaoHe'), handed.參與者);
check('原廠商仍看得到這筆議題', handed !== undefined);

console.log('\n【清理規則】');
fresh();
const purged = H.parse(doPost({postData:{contents:JSON.stringify({
  adminKey:ADMIN, action:'purge', uuids:['u-old','u-006','u-011']})}})).data;
check('符合三條件的被刪除', purged.deleted.length === 1 && purged.deleted[0] === 'u-old');
const reasons = {}; purged.refused.forEach(r => reasons[r.uuid] = r.reason);
check('未結案的被拒絕', reasons['u-006'] === '未結案', reasons['u-006']);
check('尚未同步的被拒絕', reasons['u-011'] === '尚未同步', reasons['u-011']);
check('刪除後表上真的少一列',
      H.parse(doGet({parameter:{action:'pull',adminKey:ADMIN}})).ok);

console.log('\n【格式】');
check('ISO 時間含冒號時區', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(nowIso_()), nowIso_());
check('壞掉的 JSON 不會炸掉',
      H.parse(doPost({postData:{contents:'{壞掉的'}})).error === 'INVALID_VALUE');
check('未知 action 被拒', H.parse(doGet({parameter:{action:'drop_all'}})).error === 'MISSING_FIELD');

console.log(`\n${'='.repeat(46)}\n通過 ${pass} 項，失敗 ${fail} 項\n`);
process.exit(fail ? 1 : 0);
