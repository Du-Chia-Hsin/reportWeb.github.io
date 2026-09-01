<script setup>
import { computed, ref } from 'vue'
import { ApiError, createIssue, fetchAll, newUuid, updateIssue } from './api.js'

/**
 * 金鑰存在 sessionStorage 而非 localStorage —— 關掉分頁就清除。
 * 廠商可能在共用電腦上操作，不該把憑證留在硬碟上。
 */
const KEY_STORE = 'reportsys.apiKey'

const apiKey       = ref(sessionStorage.getItem(KEY_STORE) || '')
const keyInput     = ref('')
const vendor       = ref(null)
const projects     = ref([])
const issues       = ref([])
const options      = ref({ 問題類型: [], 影響等級: [], 目前狀態: [] })
const activeCode   = ref('')
const statusFilter = ref('未結案')
const loading      = ref(false)
const error        = ref('')
const notice       = ref('')

const CLOSED = ['已結案', '已取消']

// ---------------------------------------------------------------- 載入

async function load(key) {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchAll(key)
    vendor.value   = data.vendor
    projects.value = data.projects
    issues.value   = data.issues
    options.value  = data.options
    apiKey.value   = key
    sessionStorage.setItem(KEY_STORE, key)
    if (!projects.value.some((p) => p.項目代碼 === activeCode.value)) {
      activeCode.value = projects.value[0]?.項目代碼 || ''
    }
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '無法連線到伺服器，請檢查網路後再試。'
    if (err instanceof ApiError && err.code === 'INVALID_KEY') signOut()
    throw err
  } finally {
    loading.value = false
  }
}

function signIn() {
  const key = keyInput.value.trim()
  if (!key) return
  load(key).catch(() => {})
}

function signOut() {
  sessionStorage.removeItem(KEY_STORE)
  apiKey.value = ''
  vendor.value = null
  projects.value = []
  issues.value = []
}

function refresh() {
  notice.value = ''
  load(apiKey.value).catch(() => {})
}

// 有存過金鑰就直接載入，省去每次重新輸入
if (apiKey.value) load(apiKey.value).catch(() => {})

// ---------------------------------------------------------------- 衍生資料

const activeProject = computed(
  () => projects.value.find((p) => p.項目代碼 === activeCode.value) || null,
)

function issuesOf(code) {
  return issues.value.filter((i) => i.項目代碼 === code)
}

function openCountOf(code) {
  return issuesOf(code).filter((i) => !CLOSED.includes(i.目前狀態)).length
}

const projectIssues = computed(() => issuesOf(activeCode.value))

const visibleIssues = computed(() => {
  const rows = projectIssues.value.filter((i) => {
    if (statusFilter.value === '全部') return true
    if (statusFilter.value === '未結案') return !CLOSED.includes(i.目前狀態)
    return CLOSED.includes(i.目前狀態)
  })
  // P1 最優先；同級距內新的在前
  return rows.sort(
    (a, b) =>
      (a.影響等級 || 'P9').localeCompare(b.影響等級 || 'P9') ||
      String(b.登錄時間).localeCompare(String(a.登錄時間)),
  )
})

function levelLabel(code) {
  return options.value.影響等級.find((l) => l.code === code)?.label || code
}

function levelDesc(code) {
  return options.value.影響等級.find((l) => l.code === code)?.desc || ''
}

function formatTime(iso) {
  if (!iso) return ''
  return String(iso).replace('T', ' ').replace(/(\+\d{2}:\d{2}|Z)$/, '').slice(0, 16)
}

// ---------------------------------------------------------------- 編輯

const editingUuid = ref('')
const draft       = ref({ 處理方式: '', 備註: '' })
const saving      = ref(false)

function startEdit(issue) {
  editingUuid.value = issue.UUID
  draft.value = { 處理方式: issue.處理方式 || '', 備註: issue.備註 || '' }
  notice.value = ''
}

function cancelEdit() {
  editingUuid.value = ''
}

async function saveEdit(issue) {
  // 只送真的改過的欄位。後端就只寫那幾格，內部同時改別的欄位不會被蓋掉。
  const changes = {}
  if (draft.value.處理方式 !== (issue.處理方式 || '')) changes.處理方式 = draft.value.處理方式
  if (draft.value.備註 !== (issue.備註 || ''))       changes.備註 = draft.value.備註
  if (!Object.keys(changes).length) return cancelEdit()

  saving.value = true
  error.value = ''
  try {
    await updateIssue(apiKey.value, issue.UUID, changes)
    editingUuid.value = ''
    notice.value = `${issue.議題編號} 已儲存`
    await load(apiKey.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '儲存失敗，請再試一次。'
  } finally {
    saving.value = false
  }
}

// ---------------------------------------------------------------- 新增

const composing = ref(false)
const form      = ref(blankForm())

function blankForm() {
  return { UUID: '', 問題類型: '', 影響等級: '', 內容: '', 備註: '' }
}

function openCompose() {
  form.value = blankForm()
  // UUID 在開啟表單時就產生並固定。送出失敗重試會帶同一個 UUID，
  // 後端認得出來不會重複建立 —— 這是整條同步鏈冪等性的起點。
  form.value.UUID = newUuid()
  form.value.問題類型 = options.value.問題類型[0] || ''
  form.value.影響等級 = options.value.影響等級[1]?.code || options.value.影響等級[0]?.code || ''
  composing.value = true
  error.value = ''
}

const canSubmit = computed(
  () => form.value.問題類型 && form.value.影響等級 && form.value.內容.trim(),
)

async function submitCompose() {
  if (!canSubmit.value) return
  saving.value = true
  error.value = ''
  try {
    const result = await createIssue(apiKey.value, {
      UUID: form.value.UUID,
      項目代碼: activeCode.value,
      問題類型: form.value.問題類型,
      影響等級: form.value.影響等級,
      內容: form.value.內容.trim(),
      備註: form.value.備註.trim(),
    })
    composing.value = false
    notice.value = result.duplicated
      ? `這筆已經送出過了，編號 ${result.議題編號}`
      : `已建立 ${result.議題編號}`
    statusFilter.value = '未結案'
    await load(apiKey.value)
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '送出失敗，請再試一次。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- ============================================ 未登入 -->
  <main v-if="!vendor" class="gate">
    <form class="gate-card" @submit.prevent="signIn">
      <p class="brand"><i></i>機台議題回報</p>
      <h1>廠商端</h1>
      <p class="hint">請輸入貴公司的專屬金鑰。金鑰由本公司窗口提供，遺失請聯絡窗口重發。</p>

      <label for="key">專屬金鑰</label>
      <input
        id="key"
        v-model="keyInput"
        type="password"
        autocomplete="off"
        spellcheck="false"
        placeholder="貼上金鑰"
      />

      <button type="submit" class="primary" :disabled="loading || !keyInput.trim()">
        {{ loading ? '載入中…' : '載入我的議題' }}
      </button>

      <p v-if="error" class="alert" role="alert">{{ error }}</p>
    </form>
  </main>

  <!-- ============================================ 已登入 -->
  <template v-else>
    <header class="topbar">
      <p class="brand"><i></i>機台議題回報</p>
      <span class="who">{{ vendor.name }}</span>
      <button class="ghost" :disabled="loading" @click="refresh">
        {{ loading ? '更新中…' : '重新整理' }}
      </button>
      <button class="ghost" @click="signOut">登出</button>
    </header>

    <nav v-if="projects.length > 1" class="tabs">
      <button
        v-for="p in projects"
        :key="p.項目代碼"
        :class="{ on: p.項目代碼 === activeCode }"
        @click="activeCode = p.項目代碼"
      >
        {{ p.專案名稱 || p.項目代碼 }}
        <span class="pill">{{ openCountOf(p.項目代碼) }}</span>
      </button>
    </nav>

    <main class="wrap">
      <p v-if="error" class="alert" role="alert">{{ error }}</p>
      <p v-if="notice" class="notice" role="status">{{ notice }}</p>

      <section v-if="activeProject" class="project">
        <div class="project-head">
          <div>
            <h1>{{ activeProject.專案名稱 || activeProject.項目代碼 }}</h1>
            <p class="sub">
              <span class="mono">{{ activeProject.項目代碼 }}</span>
              <template v-if="activeProject.設備名稱">
                · 設備 <span class="mono">{{ activeProject.設備名稱 }}</span>
              </template>
            </p>
          </div>
          <button
            v-if="activeProject.canCreate"
            class="primary"
            @click="openCompose"
          >
            新增議題
          </button>
        </div>

        <!--
          刻意寫「與您相關的議題」而不是「議題總數」。
          參與制之下廠商看不到純內部議題，這個數字必然小於內部端看到的，
          標清楚才不會在開會對數字時起爭議。
        -->
        <dl class="stats">
          <div>
            <dt>與您相關的議題</dt>
            <dd>{{ projectIssues.length }}</dd>
          </div>
          <div>
            <dt>未結案</dt>
            <dd>{{ openCountOf(activeCode) }}</dd>
          </div>
        </dl>

        <div class="filters" role="group" aria-label="狀態篩選">
          <button
            v-for="f in ['未結案', '已結案', '全部']"
            :key="f"
            :class="{ on: statusFilter === f }"
            @click="statusFilter = f"
          >
            {{ f }}
          </button>
        </div>

        <p v-if="!visibleIssues.length" class="empty">
          {{ statusFilter === '全部' ? '這個專案還沒有與您相關的議題。' : `沒有${statusFilter}的議題。` }}
        </p>

        <article v-for="issue in visibleIssues" :key="issue.UUID" class="issue">
          <div class="issue-head">
            <span class="no mono">{{ issue.議題編號 }}</span>
            <span
              class="chip"
              :class="'lv-' + (issue.影響等級 || '').toLowerCase()"
              :title="levelDesc(issue.影響等級)"
            >{{ levelLabel(issue.影響等級) }}</span>
            <span class="chip" :class="CLOSED.includes(issue.目前狀態) ? 'st-done' : 'st-open'">
              {{ issue.目前狀態 }}
            </span>
            <span class="type">{{ issue.問題類型 }}</span>
            <span class="when mono">{{ formatTime(issue.登錄時間) }}</span>
          </div>

          <p class="content">{{ issue.內容 }}</p>

          <template v-if="editingUuid === issue.UUID">
            <label :for="'r-' + issue.UUID">處理方式</label>
            <textarea :id="'r-' + issue.UUID" v-model="draft.處理方式" rows="3"></textarea>
            <label :for="'m-' + issue.UUID">備註</label>
            <textarea :id="'m-' + issue.UUID" v-model="draft.備註" rows="2"></textarea>
            <div class="row-actions">
              <button class="primary" :disabled="saving" @click="saveEdit(issue)">
                {{ saving ? '儲存中…' : '儲存' }}
              </button>
              <button class="ghost" :disabled="saving" @click="cancelEdit">取消</button>
            </div>
          </template>

          <template v-else>
            <dl class="detail">
              <div v-if="issue.處理方式">
                <dt>處理方式</dt><dd>{{ issue.處理方式 }}</dd>
              </div>
              <div v-if="issue.備註">
                <dt>備註</dt><dd>{{ issue.備註 }}</dd>
              </div>
              <div v-if="issue.責任單位">
                <dt>責任單位</dt><dd class="mono">{{ issue.責任單位 }}</dd>
              </div>
              <div v-if="issue.預計完成日">
                <dt>預計完成</dt><dd class="mono">{{ issue.預計完成日 }}</dd>
              </div>
              <div v-if="issue.實際結案日">
                <dt>實際結案</dt><dd class="mono">{{ issue.實際結案日 }}</dd>
              </div>
            </dl>
            <div class="row-actions">
              <button class="ghost" @click="startEdit(issue)">填寫處理方式</button>
            </div>
          </template>
        </article>
      </section>

      <p v-else class="empty">
        目前沒有指派給貴公司的專案。如果這不符合預期，請聯絡本公司窗口。
      </p>
    </main>

    <!-- ============================================ 新增議題 -->
    <div v-if="composing" class="scrim" @click.self="composing = false">
      <form class="sheet" @submit.prevent="submitCompose">
        <h2>新增議題</h2>
        <p class="sub">
          {{ activeProject?.專案名稱 || activeCode }}
          <span class="mono">{{ activeCode }}</span>
        </p>

        <label for="c-type">問題類型</label>
        <select id="c-type" v-model="form.問題類型">
          <option v-for="t in options.問題類型" :key="t" :value="t">{{ t }}</option>
        </select>

        <label for="c-level">影響等級</label>
        <select id="c-level" v-model="form.影響等級">
          <option v-for="l in options.影響等級" :key="l.code" :value="l.code">
            {{ l.label }} — {{ l.desc }}
          </option>
        </select>

        <label for="c-content">內容</label>
        <textarea
          id="c-content"
          v-model="form.內容"
          rows="5"
          placeholder="請描述遇到的狀況、發生條件與影響範圍"
        ></textarea>

        <label for="c-remark">備註（選填）</label>
        <textarea id="c-remark" v-model="form.備註" rows="2"></textarea>

        <p v-if="error" class="alert" role="alert">{{ error }}</p>

        <div class="row-actions">
          <button type="submit" class="primary" :disabled="saving || !canSubmit">
            {{ saving ? '送出中…' : '送出' }}
          </button>
          <button type="button" class="ghost" :disabled="saving" @click="composing = false">
            取消
          </button>
        </div>
      </form>
    </div>
  </template>
</template>

<style scoped>
.mono { font-family: var(--mono); }

.brand {
  display: flex; align-items: center; gap: 8px; margin: 0;
  font-size: 13px; font-weight: 700; letter-spacing: .02em;
}
.brand i { width: 9px; height: 9px; background: var(--accent); display: block; flex: none; }

/* ---------- 登入 ---------- */
.gate { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.gate-card {
  width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 10px;
  background: var(--surface); border: 1px solid var(--line);
  border-top: 3px solid var(--accent); border-radius: var(--radius);
  padding: 30px 28px 28px; box-shadow: var(--shadow);
}
.gate-card h1 { margin: 6px 0 0; font-size: 25px; letter-spacing: -.01em; }
.hint { margin: 0 0 10px; font-size: 13px; color: var(--ink-3); line-height: 1.6; }

/* ---------- 頂列 ---------- */
.topbar {
  display: flex; align-items: center; gap: 14px; padding: 0 22px; height: 54px;
  border-bottom: 1px solid var(--line); background: var(--surface);
  position: sticky; top: 0; z-index: 5;
}
.who { margin-left: auto; font-size: 13.5px; font-weight: 600; }

/* ---------- 專案分頁 ---------- */
.tabs {
  display: flex; gap: 2px; padding: 0 22px; overflow-x: auto;
  border-bottom: 1px solid var(--line); background: var(--surface);
}
.tabs button {
  flex: none; display: flex; align-items: center; gap: 8px;
  background: none; border: 0; border-bottom: 2px solid transparent;
  padding: 11px 14px; font-size: 13.5px; font-weight: 500; color: var(--ink-3);
}
.tabs button:hover { color: var(--ink); }
.tabs button.on { color: var(--ink); border-bottom-color: var(--accent); font-weight: 700; }
.pill {
  font: 600 11px/1 var(--mono); padding: 3px 6px; border-radius: 10px;
  background: var(--surface-2); color: var(--ink-3);
}
.tabs button.on .pill { background: var(--accent-soft); color: var(--accent); }

/* ---------- 版面 ---------- */
.wrap { max-width: 860px; margin: 0 auto; padding: 26px 22px 80px; }

.project-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.project-head h1 { margin: 0; font-size: 24px; letter-spacing: -.01em; }
.sub { margin: 4px 0 0; font-size: 13px; color: var(--ink-3); }

.stats { display: flex; gap: 0; margin: 20px 0 0; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.stats div { flex: 1; padding: 12px 18px; border-right: 1px solid var(--line); }
.stats div:last-child { border-right: 0; }
.stats dt { font-size: 11px; letter-spacing: .06em; color: var(--ink-3); font-weight: 600; }
.stats dd { margin: 2px 0 0; font: 700 22px/1.2 var(--mono); }

.filters { display: flex; gap: 6px; margin: 22px 0 14px; }
.filters button {
  background: none; border: 1px solid var(--line-strong); border-radius: 999px;
  padding: 5px 14px; font-size: 12.5px; color: var(--ink-2);
}
.filters button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }

.empty {
  margin: 30px 0; padding: 34px 20px; text-align: center;
  color: var(--ink-3); font-size: 13.5px;
  border: 1px dashed var(--line-strong); border-radius: var(--radius);
}

/* ---------- 議題卡 ---------- */
.issue {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 16px 18px; margin-bottom: 12px;
}
.issue-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.no { font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
.type { font-size: 12.5px; color: var(--ink-2); }
.when { margin-left: auto; font-size: 11.5px; color: var(--ink-3); }

.chip {
  font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 3px; white-space: nowrap;
}
.lv-p1 { color: var(--p1); background: var(--p1-bg); }
.lv-p2 { color: var(--p2); background: var(--p2-bg); }
.lv-p3 { color: var(--p3); background: var(--p3-bg); }
.lv-p4 { color: var(--p4); background: var(--p4-bg); }
.st-open { color: var(--open); background: var(--open-bg); }
.st-done { color: var(--done); background: var(--done-bg); }

.content { margin: 12px 0 0; font-size: 14.5px; line-height: 1.7; white-space: pre-wrap; }

.detail { margin: 14px 0 0; display: grid; gap: 8px; }
.detail div { display: grid; grid-template-columns: 76px 1fr; gap: 12px; align-items: start; }
.detail dt { font-size: 12px; color: var(--ink-3); font-weight: 600; }
.detail dd { margin: 0; font-size: 13.5px; color: var(--ink-2); white-space: pre-wrap; }

.row-actions { display: flex; gap: 8px; margin-top: 14px; }

/* ---------- 表單元件 ---------- */
label {
  font-size: 12px; font-weight: 600; letter-spacing: .04em;
  color: var(--ink-3); margin-top: 10px;
}
input, select, textarea {
  width: 100%; background: var(--ground); border: 1px solid var(--line-strong);
  border-radius: var(--radius); padding: 9px 11px; font-size: 14px;
}
textarea { resize: vertical; line-height: 1.6; }
input:focus, select:focus, textarea:focus { border-color: var(--accent); }

button.primary {
  background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent);
  border-radius: var(--radius); padding: 9px 18px; font-size: 14px; font-weight: 600;
}
button.ghost {
  background: var(--ground); color: var(--ink-2); border: 1px solid var(--line-strong);
  border-radius: var(--radius); padding: 7px 14px; font-size: 13px;
}
button.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.gate-card button.primary { margin-top: 16px; padding: 11px; }

.alert {
  margin: 14px 0 0; padding: 10px 13px; font-size: 13px; line-height: 1.6;
  color: var(--accent); background: var(--accent-soft);
  border: 1px solid var(--accent-line); border-radius: var(--radius);
}
.notice {
  margin: 0 0 16px; padding: 10px 13px; font-size: 13px;
  color: var(--open); background: var(--open-bg); border-radius: var(--radius);
}

/* ---------- 新增議題 ---------- */
.scrim {
  position: fixed; inset: 0; z-index: 20; display: grid; place-items: center;
  padding: 20px; background: rgba(20, 19, 19, .5); overflow-y: auto;
}
.sheet {
  width: 100%; max-width: 520px; display: flex; flex-direction: column;
  background: var(--ground); border: 1px solid var(--line);
  border-top: 3px solid var(--accent); border-radius: var(--radius);
  padding: 24px 26px 26px; box-shadow: var(--shadow);
}
.sheet h2 { margin: 0; font-size: 20px; }
.sheet .row-actions { margin-top: 20px; }

@media (max-width: 560px) {
  .topbar, .tabs { padding-inline: 14px; }
  .wrap { padding-inline: 14px; }
  .detail div { grid-template-columns: 1fr; gap: 2px; }
  .when { margin-left: 0; width: 100%; }
}
</style>
