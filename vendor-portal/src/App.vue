<template>
  <div class="container">
    <h2>機台異常狀況回報系統 (廠商端)</h2>
    
    <!-- 驗證區塊 -->
    <div class="card">
      <label>請輸入專屬金鑰：</label>
      <input v-model="apiKey" type="password" placeholder="輸入 API Key" />
      <button @click="fetchData">載入我的機台資料</button>
    </div>

    <!-- 寫入區塊 -->
    <div class="card" v-if="apiKey">
      <h3>新增異常回報</h3>
      <input v-model="form.machineCode" placeholder="機台編號 (例: CNC-01)" />
      <select v-model="form.statusCode">
        <option value="1">正常</option>
        <option value="2">警告</option>
        <option value="3">停機</option>
      </select>
      <input v-model="form.temperature" type="number" placeholder="溫度" />
      <button @click="submitData">送出回報</button>
    </div>

    <!-- 歷史資料顯示區塊 -->
    <div class="card" v-if="historyData.length > 0">
      <h3>歷史回報紀錄</h3>
      <table border="1" width="100%">
        <tr>
          <th>機台編號</th>
          <th>溫度</th>
          <th>同步狀態</th>
        </tr>
        <tr v-for="(item, index) in historyData" :key="index">
          <td>{{ item.machine_code }}</td>
          <td>{{ item.temperature }}</td>
          <td>
            <span v-if="item.sync_status === 'pending'">⏳ 待處理</span>
            <span v-else-if="item.sync_status === 'updated'">✅ 已同步</span>
          </td>
        </tr>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 定義你的 Google Apps Script API 網址
const GAS_API_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnS2-JDFGjd7m_kpJOlTx7fDHg0b-kwoNmQUMJSEIMZzKdeWTECuKobbiLnZUVwCKbNHvF5fESTF2_C_Z7Uuf4rVeKF9p8zB65qTCpqA2SQRx0vGn38KmxLSm21JV74p0eu2Crfo18WZyHz0w5aryJOxkY1uAIfg4s1JlJwtVMF9Dc0SItKeIXz_gJcq3TIvzJ4b7z47RtFfJudKM23rgn9tSw4gXCz6W5eY8-TSuNEhZ2RpOGlwpnOAN4968xlhMB3RwJJ4tyCF9rRNk2hcH1cVF32ypA&lib=MBrMNVbYK4vh5L2wgvk_F89QHGojujHHh'

const apiKey = ref('')
const historyData = ref([])
const form = ref({
  machineCode: '',
  statusCode: '1',
  temperature: ''
})

// 讀取雲端資料
const fetchData = async () => {
  if (!apiKey.value) return alert('請先輸入金鑰')
  
  try {
    const res = await fetch(`${GAS_API_URL}?apiKey=${apiKey.value}`)
    const data = await res.json()
    historyData.value = data 
  } catch (error) {
    console.error('讀取失敗', error)
  }
}

// 寫入資料到雲端
const submitData = async () => {
  if (!form.value.machineCode) return alert('請輸入機台編號')

  const payload = {
    apiKey: apiKey.value,
    action: 'insert',
    data: {
      machine_code: form.value.machineCode,
      status_code: form.value.statusCode,
      temperature: form.value.temperature
    }
  }

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    const result = await res.json()
    if (result.status === 'success') {
      alert('回報成功！')
      fetchData()
    }
  } catch (error) {
    console.error('上傳失敗', error)
  }
}
</script>

<style scoped>
.container { max-width: 600px; margin: 0 auto; font-family: sans-serif; }
.card { border: 1px solid #ccc; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
input, select, button { margin: 5px 0; padding: 8px; width: 100%; box-sizing: border-box; }
button { background-color: #007bff; color: white; border: none; cursor: pointer; }
button:hover { background-color: #0056b3; }
</style>