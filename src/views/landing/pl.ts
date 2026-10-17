import type { LandingPack } from '../../composables/useLandingLocale';

// TODO(pl): Replace the English source copy and metadata with Polish.
const pack: LandingPack = {
  meta: {
    "title": "ZeppBridge · Your watch records. Your own archive.",
    "description": "Keep Amazfit / Zepp heart rate, sleep and workouts in a local health archive. Explore the synthetic v3 sample or download the public stable release. Free and open source.",
    "ogTitle": "ZeppBridge · Your watch records. Your own archive.",
    "ogDescription": "Keep Amazfit / Zepp heart rate, sleep and workouts in a local health archive. Explore the synthetic v3 sample or download the public stable release. Free and open source."
  },
  copy: {
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
      "titleLead": "Your watch history.",
      "titleAccent": "Your own computer.",
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
      "edition": "ZeppBridge 3 · Synthetic sample data. Download the latest stable release to use your own data."
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
        "channel": "Downloads offer the latest stable release of ZeppBridge 3. The demo uses synthetic data; see release notes for changes in each version.",
        "systems": "Windows 10 / 11 x64 · macOS Apple Silicon · Linux x86_64",
        "ai": "Browsing and exporting need no AI. An external AI uses the service and account you choose.",
        "windows": "Windows installers have no trusted code signature yet. Unknown-publisher or SmartScreen warnings may appear. Verify the official release source before installing.",
        "macos": "macOS builds are unsigned and not notarized. First launch may be blocked; follow the project’s installation instructions."
      }
    },
    "footer": {
      "tagline": "A local-first bridge for Amazfit and Zepp data.",
      "disclaimer": "ZeppBridge is an independent open-source project participating in the Zepp Developer Partner program, not an official Zepp product. Zepp and Amazfit trademarks belong to their owners.",
      "source": "Source"
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
          "answer": "The demo shows ZeppBridge 3 with synthetic data. Downloads offer the latest stable release. Check release notes for version changes and your device's compatibility before sending a plan."
        }
      ]
    },
    "rebuild": {
      "featuresHeading": "See your time in the records you keep.",
      "featuresLead": "Sleep, heart rate, workouts and plans. See how each part of your archive comes together.",
      "demoHeading": "Try it before you download it",
      "demoLead": "The real V3 frontend with synthetic samples. No sign-in, no access to your personal data.",
      "mobileHint": "This is a desktop application. On your phone, view it fullscreen; use a computer for interaction.",
      "fullscreen": "View the desktop demo fullscreen",
      "retry": "Retry the demo",
      "play": "Play demo",
      "pause": "Pause demo",
      "mediaNote": "V3 · Synthetic sample · Recorded in dark mode",
      "moreConnections": "More ways to connect",
      "partner": "Zepp Developer Partner program",
      "disclaimer": "ZeppBridge is an independent open-source project participating in the Zepp Developer Partner program, not an official Zepp product. Zepp and Amazfit trademarks belong to their owners.",
      "docsHeading": "A place to start.",
      "guide": "Setup and user guide",
      "versions": "Versions and release notes",
      "community": "Source and community",
      "privacyDoc": "Data and privacy",
      "star": "Finding this useful? A Star on GitHub helps others find it.",
      "dismiss": "Dismiss",
      "nav": [
        "Features",
        "Data & privacy",
        "Try the app",
        "Guide"
      ],
      "title": [
        "Your watch history.",
        "Your own computer."
      ],
      "stories": [
        {
          "eyebrow": "Local archive",
          "title": "Give your records a local copy",
          "body": "Connect your own Zepp account and keep existing cloud heart rate, sleep and workouts on your computer. Synced records remain readable offline.",
          "bullets": [
            "Synced records available offline",
            "Inspect sources and coverage"
          ]
        },
        {
          "eyebrow": "Sleep history",
          "title": "Give every night a place in your history",
          "body": "Browse your sleep history and open a night’s duration and stages. Nights without a watch stay missing; records cannot replace a medical diagnosis.",
          "bullets": [
            "Night-by-night history and stages",
            "Unmeasured nights stay missing"
          ]
        },
        {
          "eyebrow": "Heart rate & gaps",
          "title": "No measurement, no value",
          "body": "Missing samples stay missing. They are never filled with zero, a previous value or an estimate. Not yet synced is different from not measured.",
          "bullets": [
            "Gaps remain in the curve",
            "No readings are filled with zero"
          ]
        },
        {
          "eyebrow": "Workouts & training",
          "title": "Keep the story of every workout",
          "body": "Review workouts, details and training trends. Available metrics depend on your device and synced records; check coverage before comparing.",
          "bullets": [
            "Workout details and training trends",
            "Use the records already available"
          ]
        },
        {
          "eyebrow": "AI handoff",
          "title": "Choose the scope, then the recipient",
          "body": "In the v3 sample, select data and dates and inspect the export. The package is prepared locally; an external AI receives it only when you submit the content.",
          "bullets": [
            "Choose dates and data",
            "Review before sending yourself"
          ]
        },
        {
          "eyebrow": "Plan review",
          "title": "Review before the next step",
          "body": "Import and review training plans in ZeppBridge 3. Sending a plan to your watch depends on device support and compatibility checks.",
          "bullets": [
            "Weekly view and daily review",
            "Delivery depends on device validation"
          ]
        },
        {
          "eyebrow": "Archive settings",
          "title": "Set the pace of your archive",
          "body": "Explore sync, retention and local-interface settings. Controls can differ between versions; check their purpose before enabling them.",
          "bullets": [
            "Sync and retention controls",
            "Enable local interfaces yourself"
          ]
        }
      ],
      "learnFeatures": "Explore features",
      "languageFallback": "This language could not load. English is shown; choose the language again to retry."
    }
  },
};

export default pack;
