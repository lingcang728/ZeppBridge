/** 繁體中文（台灣）P4 落地頁文案。結構與 zh / en 保持一致。 */
import type { P4Copy } from '../p4Copy';

const pack: P4Copy = {
  chapters: [
    {
      id: 'motion',
      name: '外觀',
      title: '一見，傾心。',
      lead: '玻璃製成的導覽列，會形變的卡片，像撲克牌一樣翻閱的日子。',
      points: [
        { id: 'glass', title: '玻璃', text: '按住並緩慢拖曳過導覽列，再輕觸切換。邊緣折射，順著指尖流動。', scene: 'glass' },
        { id: 'morph', title: '形變', text: '卡片展開為頁面，返回時回到原處。一處清晰，萬物退後。', scene: 'morph' },
        { id: 'poker', title: '牌桌', text: '日牌連續翻閱，整月、整週逐層展開。挑選好的，放入收集箱。', scene: 'poker' },
        { id: 'theme', title: '日月', text: '深淺兩套主題，一鍵入夜。', scene: 'theme' },
      ],
    },
    {
      id: 'connection',
      name: '連線',
      title: '雲端的紀錄，回到桌上。',
      lead: '連線 Zepp 帳號，紀錄同步至這台電腦。設定好頻率，之後交給自動同步。',
      points: [
        { id: 'account', title: '官方授權', text: '在系統瀏覽器中登入 Zepp，用 Google、Apple、小米、Facebook 登入的帳號也能使用。授權狀態隨時可查。', scene: 'account' },
        { id: 'sync', title: '自動同步', text: '關閉、15、30、60 分鐘。你睡你的，它同步它的。', scene: 'sync' },
        { id: 'devices', title: '認得你的錶', text: '自動辨識型號；認錯時，親手指認。', scene: 'devices' },
        { id: 'local', title: '留在本機', text: '從 Zepp 同步的健康紀錄儲存在本機，不經過我們的伺服器。交給 AI 的內容由你選擇。', scene: 'local' },
      ],
    },
    {
      id: 'records',
      name: '看懂',
      title: '數十項指標，盡收眼底。',
      lead: '在一頁中看清所有趨勢，身體狀態一目了然。點開指標，繼續查看完整紀錄。',
      points: [
        { id: 'overview', title: '隨你排列', text: '睡眠還是訓練，首頁依你的關注重新排列。上下瀏覽，再點入詳細資料。', scene: 'overview' },
        { id: 'normal', title: '你的常態', text: '每項指標下方那行為你個人的常態範圍，不與他人比較。點選「?」檢視其來源。', scene: 'normal' },
        { id: 'workouts', title: '跑過的路，都有回聲', text: '與自己以往相近距離的運動相比，再看心率、配速與軌跡。', scene: 'workouts' },
        { id: 'gaps', title: '絕不編造', text: '沒測到就留白。不拿 0、上一次的數值或預估值填空。', scene: 'gaps' },
      ],
    },
    {
      id: 'journal',
      name: '留檔',
      title: '練過的，都算數。',
      lead: '年輪、履歷、每次練完的感受，還有作者寄來的信，都儲存在這台電腦上。',
      points: [
        { id: 'rings', title: '年輪', text: '一年長一圈，練得多的那週更寬。', scene: 'rings' },
        { id: 'journal', title: '履歷', text: '個人最佳紀錄、賽事倒數、獎牌牆；跑鞋達到里程，提醒你更換。', scene: 'journal' },
        { id: 'feel', title: '練完記錄感受', text: '給這次打個分數，標註哪裡痠痛，記下穿哪雙鞋。', scene: 'feel' },
        { id: 'import', title: '匯入與整理', text: 'GPX、FIT 與 Strava 匯出皆能匯入；多選後批次更改類型或隱藏。', scene: 'import' },
        { id: 'letters', title: '信匣', text: '作者每版寄來一封信，你回信，作者會讀也會回。每週還有一封你的數據來信。', scene: 'letters' },
      ],
    },
    {
      id: 'ai',
      name: '交給 AI',
      title: '沿用現有訂閱，不多花一分錢。',
      lead: '選好日子，紀錄化為單一檔案。交給常用的 AI 繼續對話，再把初稿帶回。',
      points: [
        { id: 'providers', title: '七家任選', text: 'ChatGPT、Claude、Gemini、Kimi、DeepSeek、豆包、Grok。沿用你現有的帳號與額度。', scene: 'ai' },
        { id: 'prompt', title: '問什麼，你說了算', text: '預設的問題可以修改，也可以自己撰寫。', scene: 'prompt' },
        { id: 'events', title: '事出有因', text: '記下感冒、旅行、出差，讓 AI 多了解一些起伏背後的背景。', scene: 'events' },
        { id: 'autopaste', title: '全自動 · Windows', text: '開啟後替你貼上、傳送，每一步先確認頁面狀態。預設關閉。', scene: 'autopaste' },
      ],
    },
    {
      id: 'ai-plan',
      name: '訓練計畫',
      title: '電腦上定稿，手錶上開練。',
      lead: '把身體狀況告訴 AI，讓它排好一週；貼回來，調整到滿意，再傳送至手錶。',
      points: [
        { id: 'receive', title: '一鍵貼回', text: '從對話到初稿，複製回來就是一週計畫。', scene: 'receive' },
        { id: 'edit', title: '計畫由你', text: '拖曳交換兩天，點入每一天逐步調整時長與強度。長按，即傳送至手錶。', scene: 'plan-edit' },
        { id: 'templates', title: '範本與匯入', text: '存為範本，下次接著練。也能匯入 .zwo 與訓練 .fit 檔案。', scene: 'templates' },
        { id: 'easy', title: '今天累了', text: '今天排了間歇、準備度又低於平時，一鍵換成輕鬆訓練。修改後由你確認傳送。', scene: 'easy' },
      ],
    },
  ],
  records: {
    sleep: { title: '睡眠', text: '從一晚的分期，到近七天的變化。點開，向下看。' },
    workouts: { title: '運動', text: '看清這一次的全貌，也看見與以往的差別。' },
  },
  settings: {
    title: '設定頁',
    lead: '大卡片逐張翻看，小卡片收納成卡包。帳號、同步、顯示與資料管理，點開就能調整。',
    summaryTitle: '細節，都在設定裡。',
    summaryLead: '十五項常用設定，一張卡疊收好。',
    items: [
      { id: 'sync', title: '自動同步', text: '關閉、15、30、60 分鐘，一檔就好。', icon: 'auto-sync' },
      { id: 'retention', title: '十年，都在本機', text: '最多十年的歷史抓回本機，一直保留。不隨雲端的視窗滾走。', icon: 'database' },
      { id: 'data', title: '資料內容', text: '哪些抓得到、哪些抓不到，一目了然。', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Claude Code、Codex 等本機工具直接來問；發布計畫需另行授權。', icon: 'structured-data' },
      { id: 'formats', title: '四種格式', text: 'JSON · CSV · GPX，運動頁再加 FIT。', icon: 'document' },
      { id: 'units', title: '單位', text: '公里或英里，距離與配速一起切換。', icon: 'settings' },
      { id: 'time', title: '時間', text: '跟隨地區，或 12 / 24 小時。', icon: 'auto-sync' },
      { id: 'date', title: '日期格式', text: '年月日的順序，依照你的習慣。', icon: 'document' },
      { id: 'scale', title: '介面縮放', text: '整個視窗，大小隨心。', icon: 'overview' },
      { id: 'backup', title: '快照與還原', text: '為資料庫儲存快照，需要時還原。', icon: 'database' },
      { id: 'api', title: '本機 API', text: '僅綁定 127.0.0.1，唯讀存取，需要權杖。', icon: 'structured-data' },
      { id: 'privacy', title: '隱私與安全', text: '憑證交由系統保護，權杖不寫入記錄檔。', icon: 'browser-login' },
      { id: 'filename', title: '檔案命名', text: '交給 AI 的檔案叫什麼，由你決定。', icon: 'document' },
      { id: 'folder', title: '隨時帶走', text: '資料就在本機資料夾中；你寫下的評分、計畫、AI 任務，一鍵匯出為 JSON。', icon: 'database' },
      { id: 'language', title: '十三種語言', text: '繁體、簡體、English、Español 等，隨時切換。', icon: 'profile' },
    ],
  },
  nav: [
    { label: '認識 ZeppBridge', links: [{ id: 'motion', label: '外觀' }, { id: 'connection', label: '連線' }, { id: 'records', label: '看懂' }, { id: 'journal', label: '留檔' }] },
    { label: '從紀錄到行動', links: [{ id: 'ai', label: '交給 AI' }, { id: 'ai-plan', label: '訓練計畫' }, { id: 'record-sleep', label: '睡眠與運動' }] },
    { label: '按你的習慣', links: [{ id: 'connect', label: '設定頁' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: '本機 API' }] },
  ],
  demoPrompt: '下週三沒空，保留一次間歇，其餘安排輕鬆訓練。',
};

export default pack;
