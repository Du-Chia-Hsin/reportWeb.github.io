/**
 * 端到端測試：攔截 GAS 端點，用假資料驅動真的 UI。
 *
 * 攔截而非連真的後端，是因為容器內的瀏覽器連 script.google.com 會被
 * 沙箱 proxy 重置（curl 可以，瀏覽器不行）。攔截也讓成功路徑能被測到 ——
 * 否則沒有有效金鑰就只驗得到錯誤畫面。
 */
import { chromium } from 'playwright';

const APP_URL = 'http://localhost:4173/reportWeb.github.io/';
const GAS = /script\.google\.com/;
const KEY = 'test-key';

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (d ? ' → ' + d : ''))); };

const OPTIONS = {
  問題類型: ['結構議題', '設計風險', '待補資料', '製程問題', '其他'],
  影響等級: [
    { code: 'P1', label: '優先', desc: '優先處理' },
    { code: 'P2', label: '重要', desc: '下次會議前處理' },
    { code: 'P3', label: '一般', desc: '找時間處理' },
    { code: 'P4', label: '待議', desc: '討論是否列入議題' },
  ],
  目前狀態: ['待確認', '處理中', '待驗證', '已結案', '已取消'],
};

function issue(o) {
  return {
    UUID: '', 議題編號: '', 項目代碼: 'DFM', 問題類型: '結構議題', 影響等級: 'P3',
    內容: '', 處理方式: '', 目前狀態: '待確認', 提出者: 'DaoHe', 提出者類別: '廠商',
    責任單位: 'AE01', 參與者: 'DaoHe,AE01', 登錄時間: '2026-08-01T10:00:00+08:00',
    最後更新時間: '2026-08-01T10:00:00+08:00', 預計完成日: '', 實際結案日: '',
    備註: '', 資料同步狀態: 'updated', 資料同步時間: '', 最後異動來源: '內部', ...o,
  };
}

const state = {
  vendor: { code: 'DaoHe', name: '稻禾' },
  projects: [
    { 項目代碼: 'DFM', 專案名稱: 'AB', 設備名稱: 'ME01', canCreate: true },
    { 項目代碼: 'DBP', 專案名稱: '', 設備名稱: '', canCreate: false },
  ],
  issues: [
    issue({ UUID: 'u1', 議題編號: 'DFM_006', 影響等級: 'P3', 內容: '一般的結構問題', 目前狀態: '待確認',
            登錄時間: '2026-07-24T20:01:05+08:00' }),
    issue({ UUID: 'u2', 議題編號: 'DFM_007', 影響等級: 'P1', 內容: '很急的問題', 目前狀態: '處理中',
            登錄時間: '2026-07-30T09:00:00+08:00', 預計完成日: '2026-09-04' }),
    issue({ UUID: 'u3', 議題編號: 'DFM_008', 影響等級: 'P2', 內容: '已經解決了', 目前狀態: '已結案',
            實際結案日: '2026-08-02', 處理方式: '已更換零件' }),
    issue({ UUID: 'u4', 議題編號: 'DBP_001', 項目代碼: 'DBP', 影響等級: 'P2', 內容: '別的專案的問題' }),
  ],
  options: OPTIONS,
};

const captured = { posts: [] };

async function mount(page) {
  await page.route(GAS, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData());
      captured.posts.push({ headers: req.headers(), body });
      if (body.action === 'create') {
        state.issues.push(issue({
          UUID: body.payload.UUID, 議題編號: 'DFM_012', 項目代碼: body.payload.項目代碼,
          問題類型: body.payload.問題類型, 影響等級: body.payload.影響等級,
          內容: body.payload.內容, 備註: body.payload.備註 || '',
          目前狀態: '待確認', 資料同步狀態: 'pending', 最後異動來源: '廠商', 責任單位: '',
          參與者: 'DaoHe', 登錄時間: '2026-09-01T12:00:00+08:00',
        }));
        return route.fulfill({ contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: { UUID: body.payload.UUID, 議題編號: 'DFM_012', duplicated: false } }) });
      }
      if (body.action === 'update') {
        const row = state.issues.find((i) => i.UUID === body.payload.UUID);
        Object.entries(body.payload).forEach(([k, v]) => { if (k !== 'UUID') row[k] = v });
        row.資料同步狀態 = 'pending';
        return route.fulfill({ contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: { UUID: body.payload.UUID } }) });
      }
    }
    const url = new URL(req.url());
    if (url.searchParams.get('apiKey') !== KEY) {
      return route.fulfill({ contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'INVALID_KEY' }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: state }) });
  });
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) });
page.on('pageerror', (e) => errors.push(String(e)));
await mount(page);

console.log('【登入】');
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.fill('#key', 'wrong');
await page.click('button.primary');
await page.waitForSelector('.alert');
ck('錯誤金鑰顯示後端訊息', (await page.locator('.alert').textContent()).includes('金鑰無效'));
ck('失敗不留下金鑰', await page.evaluate(() => sessionStorage.getItem('reportsys.apiKey')) === null);

await page.fill('#key', KEY);
await page.click('button.primary');
await page.waitForSelector('.topbar');
ck('登入後顯示廠商名稱', (await page.locator('.who').textContent()).trim() === '稻禾');
ck('成功後金鑰存進 sessionStorage',
   await page.evaluate(() => sessionStorage.getItem('reportsys.apiKey')) === KEY);

console.log('\n【專案分頁】');
ck('兩個專案各一個分頁', await page.locator('.tabs button').count() === 2);
ck('第一個分頁預設選取', await page.locator('.tabs button').first().getAttribute('class') === 'on');
ck('分頁顯示未結案數（DFM 有 2 筆未結案）',
   (await page.locator('.tabs button').first().locator('.pill').textContent()) === '2');
ck('無專案名稱時退回顯示代碼',
   (await page.locator('.tabs button').nth(1).textContent()).includes('DBP'));

console.log('\n【統計與文案】');
const dts = await page.locator('.stats dt').allTextContents();
ck('寫「與您相關的議題」而非「議題總數」', dts[0] === '與您相關的議題', dts.join('/'));
const dds = await page.locator('.stats dd').allTextContents();
ck('DFM 相關議題 3 筆', dds[0] === '3', dds[0]);
ck('DFM 未結案 2 筆', dds[1] === '2', dds[1]);

console.log('\n【列表與排序】');
ck('預設只顯示未結案（2 筆）', await page.locator('.issue').count() === 2);
const nos = await page.locator('.issue .no').allTextContents();
ck('P1 排在 P3 前面', nos[0] === 'DFM_007', nos.join(','));
ck('影響等級顯示中文簡稱而非 P 代碼',
   (await page.locator('.issue .chip').first().textContent()).trim() === '優先');
ck('等級 tooltip 帶說明',
   await page.locator('.issue .chip').first().getAttribute('title') === '優先處理');

await page.click('.filters button:has-text("已結案")');
ck('切到已結案顯示 1 筆', await page.locator('.issue').count() === 1);
await page.click('.filters button:has-text("全部")');
ck('切到全部顯示 3 筆', await page.locator('.issue').count() === 3);
await page.click('.filters button:has-text("未結案")');

console.log('\n【建立權限】');
ck('canCreate 的專案顯示新增鈕', await page.locator('.project-head button.primary').count() === 1);
await page.click('.tabs button:nth-child(2)');
ck('canCreate=false 的專案沒有新增鈕', await page.locator('.project-head button.primary').count() === 0);
ck('切分頁後只顯示該專案議題', (await page.locator('.issue .no').first().textContent()) === 'DBP_001');
await page.click('.tabs button:nth-child(1)');

console.log('\n【新增議題】');
await page.click('.project-head button.primary');
await page.waitForSelector('.sheet');
ck('未填內容時送出鈕停用', await page.locator('.sheet button.primary').isDisabled());
await page.selectOption('#c-type', '設計風險');
await page.selectOption('#c-level', 'P1');
await page.fill('#c-content', '新的測試議題');
ck('填完後送出鈕啟用', !(await page.locator('.sheet button.primary').isDisabled()));
await page.click('.sheet button.primary');
await page.waitForSelector('.notice');
ck('顯示建立成功訊息', (await page.locator('.notice').textContent()).includes('DFM_012'));

const createPost = captured.posts.find((p) => p.body.action === 'create');
ck('POST 用 text/plain（避開 CORS preflight）',
   createPost.headers['content-type'].startsWith('text/plain'), createPost.headers['content-type']);
ck('前端自己產生 UUID v4',
   /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(createPost.body.payload.UUID),
   createPost.body.payload.UUID);
ck('項目代碼帶的是當前分頁', createPost.body.payload.項目代碼 === 'DFM');
ck('影響等級送代碼不送中文', createPost.body.payload.影響等級 === 'P1');
ck('沒有送出伺服器自己會填的欄位',
   !('提出者' in createPost.body.payload) && !('議題編號' in createPost.body.payload));
ck('新議題出現在列表', (await page.locator('.issue .no').allTextContents()).includes('DFM_012'));

console.log('\n【編輯處理方式】');
await page.click('.issue:has-text("DFM_007") button.ghost');
await page.fill('.issue:has-text("DFM_007") textarea >> nth=0', '已聯絡原廠');
await page.click('.issue:has-text("DFM_007") button.primary');
await page.waitForFunction(() => !document.querySelector('.issue textarea'));
const updPost = captured.posts.find((p) => p.body.action === 'update');
ck('只送有改動的欄位', Object.keys(updPost.body.payload).sort().join(',') === 'UUID,處理方式',
   Object.keys(updPost.body.payload).join(','));
ck('沒有整列送回（不會蓋掉內部的改動）', !('預計完成日' in updPost.body.payload));
ck('畫面顯示更新後的處理方式',
   (await page.locator('.issue:has-text("DFM_007")').textContent()).includes('已聯絡原廠'));

console.log('\n【登出】');
await page.click('.topbar button:has-text("登出")');
await page.waitForSelector('.gate');
ck('回到登入畫面', await page.locator('#key').count() === 1);
ck('sessionStorage 已清除',
   await page.evaluate(() => sessionStorage.getItem('reportsys.apiKey')) === null);

console.log('\n【版面與可用性】');
await page.fill('#key', KEY); await page.click('button.primary'); await page.waitForSelector('.topbar');
await page.screenshot({ path: '/tmp/app-light.png', fullPage: true });

const m = await browser.newPage({ viewport: { width: 390, height: 780 } });
await mount(m);
await m.goto(APP_URL); await m.fill('#key', KEY); await m.click('button.primary');
await m.waitForSelector('.topbar');
ck('手機版沒有水平捲動',
   !(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await m.screenshot({ path: '/tmp/app-mobile.png', fullPage: true });

const d = await browser.newPage({ viewport: { width: 1100, height: 900 }, colorScheme: 'dark' });
await mount(d);
await d.goto(APP_URL); await d.fill('#key', KEY); await d.click('button.primary');
await d.waitForSelector('.topbar');
ck('深色模式底色有換',
   await d.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(19, 18, 18)');
await d.screenshot({ path: '/tmp/app-dark.png', fullPage: true });

ck('全程沒有 console 錯誤', errors.length === 0, errors.join(' | '));

console.log(`\n${'='.repeat(44)}\n通過 ${pass}，失敗 ${fail}\n`);
await browser.close();
process.exit(fail ? 1 : 0);
