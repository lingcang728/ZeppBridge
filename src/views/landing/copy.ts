import type { LandingCopy } from './types';

/** Immediate zh/en copy. The other eight locales are loaded on demand. */
export const COPY: Record<'zh' | 'en', LandingCopy> = {
  "zh": {
    "nav": {
      "home": "ZeppBridge 首页",
      "site": "网站导航",
      "demo": "演示",
      "ai": "交给 AI",
      "privacy": "隐私",
      "download": "下载公开版",
      "github": "GitHub",
      "language": "界面语言",
      "toDark": "切换到深色",
      "toLight": "切换到浅色",
      "connect": "连接",
      "faq": "常见问题"
    },
    "downloads": {
      "windows": {
        "label": "下载 Windows 版",
        "hint": "x64 安装包",
        "msi": "批量部署用 MSI"
      },
      "macos": {
        "label": "下载 macOS 版",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "实验性",
        "note": "deb / rpm / AppImage / Flatpak 由 CI 构建，还没人在真实 Linux 桌面上完整跑通登录和密钥环。遇到问题请开 issue。"
      },
      "status": {
        "loading": "正在读取最新安装包",
        "ready": "点击直接下载",
        "fallback": "会打开 GitHub Releases 页面，在那里挑安装包"
      }
    },
    "sample": "示例",
    "hero": {
      "eyebrow": "免费 · 开源 · 本地健康档案",
      "titleLead": "手表记录，",
      "titleAccent": "自己的档案。",
      "lead": "把 Amazfit 的心率、睡眠和运动，从 Zepp 云端保存到自己的电脑。查看历史，保留缺失，按需导出。",
      "github": "在 GitHub 上看源码",
      "meta": "免费 · Windows 10 / 11 · macOS（Apple Silicon） · Linux",
      "devices": "Amazfit 设备，指标随型号而异",
      "stage": {
        "hint": "点击进入示例",
        "note": "真实应用界面，使用合成数据，不连接你的账号。",
        "loading": "正在打开应用…",
        "exit": "退出体验",
        "unavailable": "演示暂时无法打开。你仍可阅读下方说明，或查看源码。"
      },
      "demo": "查看示例",
      "edition": "开发中的 v3 · 合成示例数据。下载按钮提供公开稳定版，界面和功能可能不同。"
    },
    "beats": [
      {
        "kicker": "01 · 同步",
        "title": "让记录有一份本地副本",
        "body": "连接自己的 Zepp 账号，把云端已有的心率、睡眠与运动保存到电脑。已同步的记录可以离线查看。"
      },
      {
        "kicker": "02 · 缺失",
        "title": "没测到，就留空",
        "body": "没有采样就是缺失，不用 0、上一个值或估算值补齐。未同步与没有测量，也需要分开看。"
      },
      {
        "kicker": "03 · 交接",
        "title": "先选范围，再决定交给谁",
        "body": "在 v3 示例中选择数据和日期，查看要导出的内容。整理文件在本机完成；只有你把内容提交给外部 AI，它才会收到。"
      },
      {
        "kicker": "04 · 计划",
        "title": "先审核，再谈下一步",
        "body": "开发中的 v3 可展示训练计划的导入与逐项审核。手表下发受设备与验证状态限制，这不是公开稳定版的通用能力承诺。"
      },
      {
        "kicker": "05 · 设置",
        "title": "档案的节奏，由你决定",
        "body": "查看同步、保留期限与本地接口设置。不同版本的设置界面会有差异，启用前先确认各项用途。"
      }
    ],
    "flap": {
      "tiles": [
        {
          "value": "1,096",
          "label": "个夜晚的睡眠"
        },
        {
          "value": "742",
          "label": "次运动，带轨迹"
        },
        {
          "value": "1.5M",
          "label": "个逐分钟心率"
        },
        {
          "value": "9.8M",
          "label": "步"
        }
      ]
    },
    "handoff": {
      "chat": "AI 对话",
      "you": "你",
      "file": "ZeppBridge 最近14天.md",
      "prompt": "整理这份合成示例中的记录，列出来源、日期和缺失项，不作健康判断。",
      "answer": "示例文件按日期整理了睡眠和运动记录。没有采样的时段保持空白。比较前应先确认两段时间的来源与覆盖是否一致；这些记录不能说明变化的原因。",
      "note": "合成示例对话。这个页面没有提交文件或连接 AI；真实使用时，由你决定是否发送给外部服务。",
      "close": "关闭"
    },
    "privacy": {
      "kicker": "数据与隐私",
      "heading": "档案在本机，去向说清楚",
      "lead": "正常同步从 Zepp 读取健康记录，保存到自己的电脑。外部 AI 是你主动选择的另一条路径。",
      "nodes": {
        "watch": "手表与 Zepp App",
        "cloud": "Zepp 云端",
        "computer": "本地健康档案",
        "export": "你选择的外部 AI"
      },
      "flowNote": "手表先经手机 Zepp App 上传，再由 ZeppBridge 同步。健康档案不经过网站保存。",
      "exportNote": "按需导出 · 自己审核与提交",
      "services": {
        "title": "网站辅助服务，职责有限",
        "copy": "官方授权的回调与令牌刷新使用网站服务；更新检查读取发行信息。错误报告仅在你确认后发送受限的诊断字段，不包含健康读数。"
      },
      "docs": "查看完整数据边界",
      "points": [
        {
          "title": "凭据默认进系统库",
          "copy": "默认使用系统凭据库。部分平台可主动选择文件存储，其保护程度不同。"
        },
        {
          "title": "本地档案不是加密保险箱",
          "copy": "健康数据库默认未加密。共享电脑时使用独立系统账号，并妥善保存备份。"
        },
        {
          "title": "导出由你发起",
          "copy": "AI 交接先在本机整理并脱敏；提交后适用接收服务的隐私规则。普通导出与完整备份的内容不同。"
        }
      ]
    },
    "connect": {
      "kicker": "连接你的记录",
      "heading": "先从官方授权开始",
      "lead": "一条日常路径。需要额外指标时，再了解高级连接。",
      "recommended": "推荐起点",
      "advanced": "高级备选",
      "edition": "这里说明当前 v3 的连接方式。公开稳定版的入口和能力，请以对应发行说明为准。",
      "docs": "阅读连接指南",
      "paths": [
        {
          "title": "Zepp 官方授权",
          "copy": "在自己的浏览器打开 Zepp 授权页，使用平常的登录方式。",
          "detail": "提供睡眠、心率、步数、运动、PAI 与体重等官方开放数据，具体取决于账号中已有的记录。"
        },
        {
          "title": "高级数据连接",
          "copy": "需要 HRV、血氧、压力或准备度时，再添加这一条。",
          "detail": "使用邮箱或手机号登录。它提供不同的字段，不代表所有型号都能测量或返回这些指标。"
        },
        {
          "title": "手动填入凭据",
          "copy": "供熟悉接口、已通过自己的合法途径取得凭据的人使用。",
          "detail": "填入令牌、用户 ID 与地区地址。不要导入来源不明的令牌，也不要把它公开。"
        }
      ],
      "note": "设备、账号中的云端记录与连接方式，共同决定可用字段。没有返回数据，不等于设备不支持；这三条不是必须完成的三个步骤。"
    },
    "final": {
      "kicker": "下载 · 公开稳定版",
      "heading": "把记录留在自己的电脑上",
      "lead": "免费、开源。同步使用你已有的 Zepp 账号，无需另建 ZeppBridge 账号。",
      "docs": "安装说明与发行记录",
      "facts": {
        "channel": "这里下载的是公开稳定版。上方为开发中的 v3 合成演示，界面与功能可能不同。",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "查看与导出不需要 AI。选择外部 AI 时，使用你自己的服务与账号。",
        "windows": "Windows 安装包尚无受信任的代码签名，系统可能显示未知发布者或 SmartScreen 提示。安装前核对官方发行来源。",
        "macos": "macOS 安装包未签名、未公证，首次打开可能被系统拦截。请按项目安装说明处理。"
      }
    },
    "footer": {
      "tagline": "本地优先的 Amazfit / Zepp 数据桥梁。",
      "disclaimer": "ZeppBridge 是独立的开源项目，与 Zepp Health、Amazfit 没有隶属关系。",
      "source": "源码"
    },
    "explore": {
      "kicker": "探索应用",
      "title": "从一段记录开始",
      "lead": "直接选择一个章节，看看开发中的 v3 如何整理记录。示例中的空白仍然是缺失。",
      "tabs": [
        "同步记录",
        "保留缺失",
        "交接给 AI",
        "审核计划",
        "管理设置"
      ]
    },
    "faq": {
      "heading": "开始前，你可能想知道",
      "lead": "六个常见问题。深入设置与版本差异，见项目文档。",
      "docs": "项目文档",
      "items": [
        {
          "question": "需要什么账号？",
          "answer": "同步需要你已有的 Zepp 账号和手机上的 Zepp App，无需额外的 ZeppBridge 账号。示例页面无需登录。"
        },
        {
          "question": "我的设备和指标支持吗？",
          "answer": "记录来自你的 Zepp 云端账号。可用指标取决于设备实际测量、云端保存内容和连接方式，不能保证每个型号都有全部字段。"
        },
        {
          "question": "断网还能用吗？",
          "answer": "已保存的本地记录可以离线查看和导出。登录、同步新记录与检查更新需要网络；手表仍需 Zepp App 上传。"
        },
        {
          "question": "图表空白是不是零？",
          "answer": "不是。未采样、未同步和无法解析需要区别看待。缺失不会用零、上一次读数或估算值补齐。"
        },
        {
          "question": "一定要把数据交给 AI 吗？",
          "answer": "不需要。导出在本机准备；只有你把内容粘贴或上传给外部 AI，接收服务才会收到。发送前确认范围、脱敏结果及其隐私规则。"
        },
        {
          "question": "下载后会和示例一样吗？",
          "answer": "示例使用开发中的 v3 和合成数据；下载提供公开稳定版。演示中的计划审核、新界面等可能尚未公开，以发行说明为准。"
        }
      ]
    }
  },
  "en": {
    "nav": {
      "home": "ZeppBridge home",
      "site": "Site navigation",
      "demo": "Demo",
      "ai": "AI handoff",
      "privacy": "Privacy",
      "download": "Get the public release",
      "github": "GitHub",
      "language": "Language",
      "toDark": "Switch to dark",
      "toLight": "Switch to light",
      "connect": "Connect",
      "faq": "FAQ"
    },
    "downloads": {
      "windows": {
        "label": "Download for Windows",
        "hint": "x64 installer",
        "msi": "MSI for managed installs"
      },
      "macos": {
        "label": "Download for macOS",
        "hint": "Apple Silicon"
      },
      "linux": {
        "label": "Linux",
        "previewBadge": "Experimental",
        "note": "deb, rpm, AppImage and Flatpak are built by CI, but nobody has run sign-in and the keyring end to end on a real Linux desktop yet. Hit a problem? Open an issue."
      },
      "status": {
        "loading": "Looking up the latest installer",
        "ready": "Click to download directly",
        "fallback": "Opens GitHub Releases, where you pick the installer"
      }
    },
    "sample": "Sample",
    "hero": {
      "eyebrow": "Free · Open source · A local health archive",
      "titleLead": "Your watch records.",
      "titleAccent": "Your own archive.",
      "lead": "Keep Amazfit heart rate, sleep and workouts from the Zepp cloud on your own computer. Browse your history, preserve gaps and export what you choose.",
      "github": "Read the source on GitHub",
      "meta": "Free · Windows 10 / 11 · macOS (Apple Silicon) · Linux",
      "devices": "Amazfit devices, with metrics that vary by model",
      "stage": {
        "hint": "Enter the sample",
        "note": "The real application with synthetic data. It does not connect to your account.",
        "loading": "Opening the app…",
        "exit": "Leave the demo",
        "unavailable": "The demo is unavailable in this browser. Read the sections below or explore the source."
      },
      "demo": "View the sample",
      "edition": "v3 in development · Synthetic sample data. Downloads offer the public stable release; its interface and features may differ."
    },
    "beats": [
      {
        "kicker": "01 · Sync",
        "title": "Give your records a local copy",
        "body": "Connect your own Zepp account and keep existing cloud heart rate, sleep and workouts on your computer. Synced records remain readable offline."
      },
      {
        "kicker": "02 · Missing data",
        "title": "No measurement, no value",
        "body": "Missing samples stay missing. They are never filled with zero, a previous value or an estimate. Not yet synced is different from not measured."
      },
      {
        "kicker": "03 · Handoff",
        "title": "Choose the scope, then the recipient",
        "body": "In the v3 sample, select data and dates and inspect the export. The package is prepared locally; an external AI receives it only when you submit the content."
      },
      {
        "kicker": "04 · Plans",
        "title": "Review before the next step",
        "body": "The developing v3 demonstrates importing and reviewing training plans. Watch delivery depends on device support and validation; it is not a blanket promise for the public stable release."
      },
      {
        "kicker": "05 · Settings",
        "title": "Set the pace of your archive",
        "body": "Explore sync, retention and local-interface settings. Controls can differ between versions; check their purpose before enabling them."
      }
    ],
    "flap": {
      "tiles": [
        {
          "value": "1,096",
          "label": "nights of sleep"
        },
        {
          "value": "742",
          "label": "workouts with routes"
        },
        {
          "value": "1.5M",
          "label": "minutes of heart rate"
        },
        {
          "value": "9.8M",
          "label": "steps"
        }
      ]
    },
    "handoff": {
      "chat": "AI chat",
      "you": "You",
      "file": "ZeppBridge last 14 days.md",
      "prompt": "Organize the records in this synthetic sample. List their sources, dates and missing fields without making health judgments.",
      "answer": "The sample file organizes sleep and workout records by date. Unmeasured periods remain blank. Before comparing ranges, check that their sources and coverage match; these records cannot explain why a change happened.",
      "note": "Synthetic example conversation. This page submits no file and connects to no AI. In real use, you decide whether to send content to an external service.",
      "close": "Close"
    },
    "privacy": {
      "kicker": "Data & privacy",
      "heading": "Your archive is local. Its paths are explicit.",
      "lead": "Normal sync reads health records from Zepp into your own computer. An external AI is a separate path you deliberately choose.",
      "nodes": {
        "watch": "Watch & Zepp app",
        "cloud": "Zepp cloud",
        "computer": "Local health archive",
        "export": "Your chosen external AI"
      },
      "flowNote": "Your watch uploads through the Zepp phone app before ZeppBridge syncs. The website does not store the health archive.",
      "exportNote": "Optional export · Review and submit yourself",
      "services": {
        "title": "Website services with limited roles",
        "copy": "Official authorization callbacks and token refresh use website services; update checks read release information. Problem reports send limited diagnostic fields only after your confirmation, without health readings."
      },
      "docs": "Read the full data boundaries",
      "points": [
        {
          "title": "System credential storage by default",
          "copy": "Credentials use the operating system vault by default. Some platforms offer an explicit file-storage option with different protection."
        },
        {
          "title": "Local does not mean encrypted",
          "copy": "The health database is unencrypted by default. Use separate OS accounts on a shared computer and protect your backups."
        },
        {
          "title": "You initiate the export",
          "copy": "AI packages are prepared and redacted locally. Once submitted, the recipient’s privacy rules apply. Ordinary exports and full backups contain different information."
        }
      ]
    },
    "connect": {
      "kicker": "Connect your records",
      "heading": "Start with official authorization",
      "lead": "One everyday path. Explore advanced connections only when you need extra fields.",
      "recommended": "Recommended start",
      "advanced": "Advanced alternatives",
      "edition": "These are the current v3 connection paths. Check the relevant release notes for the public stable version’s entry points and capabilities.",
      "docs": "Read the connection guide",
      "paths": [
        {
          "title": "Official Zepp authorization",
          "copy": "Open Zepp’s authorization page in your own browser and use your usual sign-in method.",
          "detail": "Reads officially available sleep, heart rate, steps, workouts, PAI and weight, depending on records already held by your account."
        },
        {
          "title": "Advanced data connection",
          "copy": "Add this path for HRV, blood oxygen, stress or readiness.",
          "detail": "Uses email or phone sign-in. It offers different fields; not every device measures or returns all of them."
        },
        {
          "title": "Manual credentials",
          "copy": "For people familiar with the API who already obtained credentials through a legitimate route they control.",
          "detail": "Enter a token, user ID and regional address. Never import a token of unknown origin or share it publicly."
        }
      ],
      "note": "Your device, cloud records and connection path determine available fields. An empty response does not prove that a device lacks support. These are alternatives, not three required steps."
    },
    "final": {
      "kicker": "Download · Public stable release",
      "heading": "Keep a copy on your own computer",
      "lead": "Free and open source. Sync uses your existing Zepp account; there is no separate ZeppBridge account.",
      "docs": "Installation & release notes",
      "facts": {
        "channel": "Downloads are the public stable release. The synthetic demo above is v3 in development; its interface and features may differ.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Browsing and exporting need no AI. An external AI uses the service and account you choose.",
        "windows": "Windows installers have no trusted code signature yet. Unknown-publisher or SmartScreen warnings may appear. Verify the official release source before installing.",
        "macos": "macOS builds are unsigned and not notarized. First launch may be blocked; follow the project’s installation instructions."
      }
    },
    "footer": {
      "tagline": "A local-first bridge for Amazfit and Zepp data.",
      "disclaimer": "ZeppBridge is an independent open-source project, not affiliated with Zepp Health or Amazfit.",
      "source": "Source"
    },
    "explore": {
      "kicker": "Explore the application",
      "title": "Start with a record",
      "lead": "Choose a chapter to see how the developing v3 organizes records. Gaps in the sample remain missing.",
      "tabs": [
        "Sync records",
        "Keep gaps",
        "AI handoff",
        "Review plans",
        "Manage settings"
      ]
    },
    "faq": {
      "heading": "A few things before you begin",
      "lead": "Six common questions. Project documentation covers detailed settings and version differences.",
      "docs": "Project documentation",
      "items": [
        {
          "question": "Which accounts do I need?",
          "answer": "Sync needs your existing Zepp account and the Zepp phone app. There is no extra ZeppBridge account. The sample page needs no sign-in."
        },
        {
          "question": "Does it support my device and metrics?",
          "answer": "Records come from your Zepp cloud account. Fields depend on what the device measured, what the cloud retained and the connection path. No model is promised every metric."
        },
        {
          "question": "Can I use it offline?",
          "answer": "Previously saved records can be viewed and exported offline. Sign-in, new syncs and update checks need a network. Your watch still uploads through the Zepp app."
        },
        {
          "question": "Does a blank chart mean zero?",
          "answer": "No. Not sampled, not yet synced and not decoded are different states. Missing values are never filled with zero, an earlier reading or an estimate."
        },
        {
          "question": "Do I have to use an AI?",
          "answer": "No. Exports are prepared locally. An external AI receives content only when you paste or upload it. Check the scope, redactions and its privacy rules before sending."
        },
        {
          "question": "Will the download match the sample?",
          "answer": "The sample is the developing v3 with synthetic data. Downloads offer the public stable release. Plan review, the new interface and other demo features may not yet be public; check release notes."
        }
      ]
    }
  }
};
