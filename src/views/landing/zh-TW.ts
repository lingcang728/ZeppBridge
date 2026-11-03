import type { LandingPack } from '../../composables/useLandingLocale';

const pack: LandingPack = {
  meta: {
    title: 'ZeppBridge · 手錶記錄，自己的檔案',
    description: '把 Amazfit / Zepp 的心率、睡眠與運動儲存為本機健康檔案。查看合成 v3 範例，下載公開穩定版。免費、開源。',
    ogTitle: 'ZeppBridge · 手錶記錄，自己的檔案',
    ogDescription: '把 Amazfit / Zepp 的心率、睡眠與運動儲存為本機健康檔案。查看合成 v3 範例，下載公開穩定版。免費、開源。',
  },
  copy: {
    nav: {
      home: 'ZeppBridge 首頁',
      site: '網站導覽',
      demo: '展示',
      ai: '交給 AI',
      privacy: '隱私',
      download: '下載公開版',
      github: 'GitHub',
      language: '介面語言',
      toDark: '切換至深色',
      toLight: '切換至淺色',
      connect: '連線',
      faq: '常見問題',
    },
    downloads: {
      windows: {
        label: '下載 Windows 版',
        hint: 'x64 安裝檔',
        msi: '大量部署用 MSI',
      },
      macos: {
        label: '下載 macOS 版',
        hint: 'Apple Silicon',
      },
      linux: {
        label: 'Linux',
        previewBadge: '實驗性',
        note: 'deb / rpm / AppImage / Flatpak 由 CI 建置，尚未有人在真實 Linux 桌面上完整跑通登入與金鑰圈。遇到問題請建立 issue。',
      },
      status: {
        loading: '正在讀取最新安裝檔',
        ready: '點擊直接下載',
        fallback: '將開啟 GitHub Releases 頁面，可在該處挑選安裝檔',
      },
    },
    sample: '範例',
    hero: {
      eyebrow: '免費 · 開源 · 本機健康檔案',
      titleLead: '你的健康紀錄，',
      titleAccent: '留在自己的電腦裡。',
      lead: '把 Amazfit 的心率、睡眠與運動，從 Zepp 雲端儲存到自己的電腦。查看歷史，保留缺失，依需求匯出。',
      github: '在 GitHub 上查看原始碼',
      meta: '免費 · Windows 10 / 11 · macOS（Apple Silicon） · Linux',
      devices: 'Amazfit 裝置，指標隨型號而異',
      stage: {
        hint: '點擊進入範例',
        note: '真實應用程式介面，使用合成資料，不連線至你的帳號。',
        loading: '正在開啟應用程式…',
        exit: '結束體驗',
        unavailable: '示範暫時無法開啟。你仍可閱讀下方說明，或查看原始碼。',
      },
      demo: '查看範例',
      edition: 'ZeppBridge 3 · 使用合成範例資料。下載最新穩定版，開始使用自己的資料。',
    },
    handoff: {
      chat: 'AI 對話',
      you: '你',
      file: 'ZeppBridge 最近14天.md',
      prompt: '整理這份合成範例中的紀錄，列出來源、日期與缺失項目，不作健康判斷。',
      answer: '範例檔案已按日期整理睡眠與運動紀錄。未採樣的時段保持空白。比較前應先確認兩段時間的來源與涵蓋範圍是否一致；這些紀錄無法說明變化的原因。',
      note: '合成範例對話。此頁面未提交檔案或連線至 AI；實際使用時，由你決定是否傳送給外部服務。',
      close: '關閉',
    },
    privacy: {
      kicker: '資料與隱私',
      heading: '檔案在本機，去向說清楚',
      lead: '日常同步從 Zepp 讀取健康紀錄，儲存到自己的電腦。外部 AI 是你主動選擇的另一條路徑。',
      nodes: {
        watch: '手錶與 Zepp App',
        cloud: 'Zepp 雲端',
        computer: '本機健康檔案',
        export: '你選擇的外部 AI',
      },
      flowNote: '手錶先經由手機 Zepp App 上傳，再由 ZeppBridge 同步。健康檔案不經由網站儲存。',
      exportNote: '依需求匯出 · 自行審核與提交',
      services: {
        title: '網站輔助服務，職責有限',
        copy: '官方授權的重新導向回呼與權杖重新整理使用網站服務；檢查更新讀取發行資訊。錯誤回報僅在你確認後傳送受限的診斷欄位，不包含健康讀數。',
      },
      docs: '查看完整資料界限',
      points: [
        {
          title: '憑證預設存入系統庫',
          copy: '預設使用系統憑證庫。部分平台可主動選擇檔案儲存，其保護程度不同。',
        },
        {
          title: '本機檔案不是加密保險箱',
          copy: '健康資料庫預設未加密。共用電腦時請使用獨立系統帳號，並妥善保存備份。',
        },
        {
          title: '匯出由你發起',
          copy: 'AI 交接先在本機整理並去識別化；提交後適用接收服務的隱私權政策。一般匯出與完整備份的內容不同。',
        },
      ],
    },
    connect: {
      kicker: '連線你的紀錄',
      heading: '先從官方授權開始',
      lead: '一條日常路徑。需要額外指標時，再了解進階連線。',
      recommended: '推薦起點',
      advanced: '進階備選',
      edition: '此處說明目前 v3 的連線方式。公開穩定版的入口與功能，請以對應發行說明為準。',
      docs: '閱讀連線指南',
      paths: [
        {
          title: 'Zepp 官方授權',
          copy: '在自己的瀏覽器開啟 Zepp 授權頁面，使用平常的登入方式。',
          detail: '提供睡眠、心率、步數、運動、PAI 與體重等官方開放資料，具體取決於帳號中已有的紀錄。',
        },
        {
          title: '進階資料連線',
          copy: '需要 HRV、血氧、壓力或準備度時，再新增此途徑。',
          detail: '使用電子郵件或手機號碼登入。它提供不同的欄位，不代表所有型號都能測量或傳回這些指標。',
        },
        {
          title: '手動填入憑證',
          copy: '供熟悉介面規格、已透過個人合法途徑取得憑證的使用者使用。',
          detail: '填入權杖、使用者 ID 與地區位址。請勿匯入來源不明的權杖，也不要將其公開。',
        },
      ],
      note: '裝置、帳號中的雲端紀錄與連線方式，共同決定可用欄位。未傳回資料不等於裝置不支援；這三條並非必須全部完成的步驟。',
    },
    final: {
      kicker: '下載 · 公開穩定版',
      heading: '把紀錄留在自己的電腦上',
      lead: '免費、開源。同步使用你現有的 Zepp 帳號，無需另建 ZeppBridge 帳號。',
      docs: '安裝說明與發行紀錄',
      facts: {
        channel: '下載頁面提供 ZeppBridge 3 最新穩定版。展示使用合成資料；各版本更新內容請查看發行說明。',
        systems: 'Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64',
        ai: '查看與匯出不需要 AI。選擇外部 AI 時，使用你自己的服務與帳號。',
        windows: 'Windows 安裝檔尚無受信任的程式碼簽章，系統可能顯示未知的發行者或 SmartScreen 提示。安裝前請核對官方發行來源。',
        macos: 'macOS 安裝檔未簽章、未公證，首次開啟可能被系統攔截。請依照專案安裝說明處理。',
      },
    },
    footer: {
      tagline: '本機優先的 Amazfit / Zepp 資料橋樑。',
      disclaimer: 'ZeppBridge 為獨立開源專案，參與 Zepp 開發者合作夥伴計畫，並非 Zepp 官方產品。Zepp 與 Amazfit 商標歸其權利人所有。',
      source: '原始碼',
    },
    faq: {
      heading: '開始前，你可能想知道',
      lead: '六個常見問題。深入設定與版本差異，請參閱專案文件。',
      docs: '專案文件',
      items: [
        {
          question: '需要什麼帳號？',
          answer: '同步需要你現有的 Zepp 帳號與手機上的 Zepp App，無需額外的 ZeppBridge 帳號。範例頁面無需登入。',
        },
        {
          question: '我的裝置和指標有支援嗎？',
          answer: '紀錄來自你的 Zepp 雲端帳號。可用指標取決於裝置實際測量、雲端儲存內容與連線方式，無法保證每個型號都有全部欄位。',
        },
        {
          question: '斷網還能使用嗎？',
          answer: '已儲存的本機紀錄可離線查看與匯出。登入、同步新紀錄與檢查更新需要網路；手錶仍需透過 Zepp App 上傳。',
        },
        {
          question: '圖表空白是不是代表數值為零？',
          answer: '不是。未採樣、未同步與無法剖析需要區別看待。缺失資料不會以零、上一次讀數或預估值補齊。',
        },
        {
          question: '一定要把資料交給 AI 嗎？',
          answer: '不需要。匯出作業在本機準備；只有當你把內容貼上或上傳至外部 AI 時，接收服務才會收到。傳送前請確認範圍、去識別化結果及其隱私權政策。',
        },
        {
          question: '下載後會和範例一樣嗎？',
          answer: '展示畫面呈現的是使用合成資料的 ZeppBridge 3。下載頁面提供最新穩定版。傳送訓練計畫前，請查看發行說明中的版本變更，並確認裝置相容性。',
        },
      ],
    },
    rebuild: {
      featuresHeading: '從日常紀錄，看見自己的時間。',
      featuresLead: '睡眠、心率、運動與計畫。逐段看看，紀錄在電腦裡如何展開。',
      demoHeading: '下載之前，先親自試試',
      demoLead: '真實 V3 前端與合成樣本。無需登入，不存取你的個人資料。',
      mobileHint: '這是桌面應用程式。手機上可全螢幕觀看，建議在電腦上操作。',
      fullscreen: '全螢幕觀看桌面範例',
      retry: '重試載入範例',
      play: '播放展示',
      pause: '暫停展示',
      mediaNote: 'V3 · 合成範例 · 深色介面錄製',
      moreConnections: '更多連線方式',
      partner: 'Zepp 開發者合作夥伴計畫',
      disclaimer: 'ZeppBridge 為獨立開源專案，參與 Zepp 開發者合作夥伴計畫，並非 Zepp 官方產品。Zepp 與 Amazfit 商標歸其權利人所有。',
      docsHeading: '從這裡開始使用。',
      guide: '使用與安裝指南',
      versions: '版本與發行紀錄',
      community: '原始碼與社群',
      privacyDoc: '資料與隱私說明',
      star: '這個專案對你有幫助？歡迎在 GitHub 給予 Star 支持。',
      dismiss: '關閉',
      nav: [
        '功能',
        '資料與隱私',
        '線上體驗',
        '使用指南',
      ],
      title: [
        '你的健康紀錄，',
        '留在自己的電腦裡。',
      ],
      stories: [
        {
          eyebrow: '本機檔案',
          title: '讓紀錄保有一份本機複本',
          body: '連線自己的 Zepp 帳號，把雲端現有的心率、睡眠與運動儲存至電腦。已同步的紀錄可離線查看。',
          bullets: [
            '已同步紀錄可離線查看',
            '來源與涵蓋範圍可查詢',
          ],
        },
        {
          eyebrow: '睡眠紀錄',
          title: '讓每一夜，都有跡可循',
          body: '瀏覽長期睡眠紀錄，點開某一晚的時長與分期。未配戴的夜晚保留缺失，紀錄不可取代醫學診斷。',
          bullets: [
            '逐夜紀錄與睡眠分期',
            '未配戴的夜晚不填補',
          ],
        },
        {
          eyebrow: '心率與缺失',
          title: '沒測到，就留白',
          body: '沒有採樣即為缺失，不用 0、上一個數值或預估值補齊。未同步與未測量，亦需分開看待。',
          bullets: [
            '曲線保留真實缺口',
            '沒有採樣不會補成 0',
          ],
        },
        {
          eyebrow: '運動與訓練',
          title: '運動之後，把過程留下',
          body: '回顧運動清單、詳細資料與訓練狀態。指標取決於裝置與已同步的紀錄，請先確認涵蓋範圍再比較。',
          bullets: [
            '運動詳細資料與訓練趨勢',
            '依現有紀錄查看',
          ],
        },
        {
          eyebrow: 'AI 交接',
          title: '先選範圍，再決定交給誰',
          body: '在 v3 範例中選擇資料與日期，預覽要匯出的內容。整理檔案在本機完成；只有當你將內容提交給外部 AI，對方才會收到。',
          bullets: [
            '先選日期與資料範圍',
            '審核後自行提交',
          ],
        },
        {
          eyebrow: '計畫審核',
          title: '先審核，再談下一步',
          body: '在 ZeppBridge 3 中匯入並檢視訓練計畫。計畫能否傳送至手錶，取決於裝置支援情況與相容性檢查結果。',
          bullets: [
            '按週瀏覽與逐日審核',
            '下發取決於裝置與驗證',
          ],
        },
        {
          eyebrow: '檔案設定',
          title: '檔案的步調，由你決定',
          body: '檢視同步、保留期限與本機介面設定。不同版本的設定介面略有差異，啟用前請先確認各項用途。',
          bullets: [
            '同步與留存設定',
            '本機介面由你啟用',
          ],
        },
      ],
      learnFeatures: '了解功能',
      languageFallback: '語言載入失敗，暫時顯示英文。重新選擇該語言可重試。',
    },
  },
};

export default pack;
