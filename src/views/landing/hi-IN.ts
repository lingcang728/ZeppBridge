import type { LandingPack } from '../../composables/useLandingLocale';

/**
 * हिन्दी (hi-IN) landing pack.
 *
 * Polite आप register in Devanagari, with the usual Hindi tech vocabulary kept
 * in English where natural (डाउनलोड, इंस्टॉलर, AI, डेटा). Product terms
 * (ZeppBridge, HAR, appToken, MCP, SQLite, EXE/MSI, Apple Silicon, AI-ready)
 * stay untranslated. Decorative overlines stay in English, matching zh/en.
 */
const pack: LandingPack = {
  copy: {
    nav: {
      home: 'ZeppBridge होम पेज',
      site: 'साइट नेविगेशन',
      features: 'यह क्या पढ़ता है',
      local: 'लोकल आउटलेट',
      connect: 'कनेक्ट करें',
      privacy: 'निजता',
      star: 'GitHub पर स्टार दें',
      language: 'भाषा',
    },
    downloads: {
      windows: { label: 'Windows के लिए डाउनलोड करें', hint: 'सुझाया गया · x64 EXE इंस्टॉलर', msi: 'मैनेज्ड डिप्लॉयमेंट: MSI डाउनलोड करें' },
      macos: { label: 'macOS के लिए डाउनलोड करें', hint: 'Apple Silicon · DMG इंस्टॉलर' },
      linux: {
        label: 'Linux',
        previewBadge: 'प्रीव्यू',
        note: 'deb / rpm / AppImage / Flatpak चारों CI में बन जाते हैं, लेकिन किसी ने अभी तक असली Linux डेस्कटॉप पर साइन-इन और कीरिंग (Secret Service / KWallet) पूरा चला कर नहीं देखा। चाहें तो आज़माएँ — और कुछ टूटे तो issue खोलें। अभी इसे ठीक यही चाहिए।',
      },
      status: {
        loading: 'GitHub पर नया रिलीज़ देखा जा रहा है…',
        ready: 'सीधे डाउनलोड होता है — बीच में कोई GitHub पेज नहीं',
        fallback: 'सीधे लिंक फ़िलहाल उपलब्ध नहीं हैं; इसके बजाय Release पेज खुलेगा',
      },
    },
    hero: {
      headlineLead: 'आपका Zepp डेटा,',
      headlineAccent: 'पूरा का पूरा वापस आपको।',
      lead: 'ZeppBridge आपके Amazfit wearable डेटा को आपके अपने Windows, Mac या Linux कंप्यूटर पर कनेक्ट, व्यवस्थित और विज़ुअलाइज़ करता है। हर फ़ील्ड अपना स्रोत साथ रखता है — खुद पढ़ें, या अपनी शर्तों पर AI को सौंपें।',
      starNudge: {
        title: 'आपका डाउनलोड शुरू हो गया है',
        copy: 'अगर ZeppBridge आपके कंप्यूटर पर जगह बना ले, तो GitHub Star से और Amazfit उपयोगकर्ता इसे ढूँढ पाएँगे।',
        action: 'GitHub पर ZeppBridge को स्टार दें',
        dismiss: 'शायद बाद में',
      },
      trust: [
        { icon: 'secure', label: 'लोकल-फ़र्स्ट' },
        { icon: 'private', label: 'डिफ़ॉल्ट रूप से निजी' },
        { icon: 'structured-data', label: 'स्ट्रक्चर्ड डेटा' },
      ],
      stageLabel: 'मौजूदा Amazfit डिवाइस ZeppBridge को डेटा देते हैं और स्ट्रक्चर्ड डेटा बनकर निकलते हैं',
      coreCaption: 'डिकोड · व्यवस्थित · विज़ुअलाइज़',
      outputs: [
        { title: 'स्ट्रक्चर्ड रिकॉर्ड', copy: 'स्रोत और टाइमस्टैम्प सुरक्षित' },
        { title: 'AI-ready', copy: 'आप कहें तभी बाहर जाता है' },
      ],
      status: { title: 'लोकल पाइपलाइन तैयार', copy: 'कुछ भी किसी ZeppBridge सर्वर से नहीं गुज़रता' },
    },
    principlesLabel: 'प्रॉडक्ट सिद्धांत',
    principles: [
      { icon: 'secure', title: 'सुरक्षित', copy: 'आपके कंप्यूटर पर ही रहता है' },
      { icon: 'private', title: 'निजी', copy: 'कुछ अपलोड नहीं, कुछ लीक नहीं' },
      { icon: 'database', title: 'प्रोवेनेंस', copy: 'स्रोत कभी नहीं मिलते' },
      { icon: 'ai-ready', title: 'AI-ready', copy: 'साफ़ संरचना, माँगने पर इस्तेमाल' },
    ],
    features: {
      overline: 'WHAT YOU CAN READ',
      heading: 'आज के आँकड़ों से लेकर हर एक सेशन तक।',
      lead: 'इंटरफ़ेस सिर्फ़ वही फ़ील्ड दिखाता है जो सच में मिले हैं। जो गायब है उसे गायब ही दिखाया जाता है — डैशबोर्ड भरने के लिए बनाए गए नंबर नहीं।',
      items: [
        { icon: 'heart-rate', title: 'लगातार हार्ट रेट', copy: 'टाइमस्टैम्प और स्रोत सुरक्षित, ताकि असली कर्व दिखे।', tone: 'red' },
        { icon: 'sleep-waves', title: 'नींद की संरचना', copy: 'डीप, लाइट, REM और जागने के चरण, लोकल पार्सिंग।', tone: 'purple' },
        { icon: 'outdoor-run', title: 'वर्कआउट डिटेल', copy: 'रूट, पेस, कैडेंस, ऊँचाई और ट्रेनिंग लोड।', tone: 'green' },
        { icon: 'vo2-max', title: 'रिकवरी मेट्रिक्स', copy: 'VO₂ Max, HRV और रिकवरी आँकड़े, स्रोत के हिसाब से।', tone: 'blue' },
      ],
    },
    local: {
      overline: 'NOT ONLY A WINDOW',
      heading: 'इसे खोलने की भी ज़रूरत नहीं।',
      lead: 'डेस्कटॉप ऐप, कमांड लाइन, MCP और read-only लोकल API एक ही कोर साझा करते हैं — यूनिट, टाइम ज़ोन, स्रोत और गायब वैल्यू की कहानी सिर्फ़ एक है। गायब है तो गायब है: कोई भी आउटलेट उस खाली जगह को शून्य से नहीं भरता।',
      items: [
        {
          icon: 'structured-data',
          title: 'पूरा इतिहास और स्नैपशॉट',
          copy: 'क्लाउड हिस्ट्री को महीने-दर-महीने वापस लाएँ, हर हिस्से का लेखा-जोखा साथ। पूरे डेटाबेस के स्नैपशॉट चेकसम के साथ, और रिस्टोर से पहले रिकॉर्ड-गिनती का अंतर दिखता है।',
          tag: 'लोकल',
        },
        {
          icon: 'document',
          title: 'कमांड लाइन',
          copy: 'status / sync / export. बिना प्रॉम्प्ट, स्थिर एक्ज़िट कोड — Task Scheduler या cron पर लगाने लायक।',
          tag: 'CLI',
        },
        {
          icon: 'ai-ready',
          title: 'सिर्फ़-पढ़ने वाला MCP',
          copy: 'AI को खुद आपका लोकल डेटा क्वेरी करने दें। stdio ट्रांसपोर्ट: कोई पोर्ट नहीं, कोई नेटवर्क एक्सेस नहीं।',
          tag: 'MCP',
        },
      ],
    },
    connect: {
      overline: 'THREE PATHS, ONE LOCAL VAULT',
      heading: 'अपने हिसाब का रास्ता चुनें।',
      lead: 'सीधे official वेब लॉगिन से लेकर पूरी तरह ऑडिट करने लायक मैनुअल हैंडऑफ़ तक। कनेक्शन की स्थिति और गड़बड़ी की वजह हमेशा साफ़ लिखी रहती है।',
      items: [
        { icon: 'browser-login', title: 'Official वेब लॉगिन', copy: 'Official फ़्लो के अंदर ही अधिकार दें। क्रेडेंशियल आपके कंप्यूटर पर रहते हैं।', tag: 'सुझाया गया' },
        { icon: 'document', title: 'HAR इंपोर्ट', copy: 'डीबगिंग और एडवांस्ड उपयोगकर्ताओं के लिए: पहले से कैप्चर किया अधिकृत रिक्वेस्ट दोबारा इस्तेमाल करें।', tag: 'एडवांस्ड' },
        { icon: 'manual-entry', title: 'मैनुअल एंट्री', copy: 'appToken और यूज़र id खुद डालें, सब कुछ दिखते हुए।', tag: 'हैंड्स-ऑन' },
      ],
    },
    privacy: {
      overline: 'PRIVACY BY ARCHITECTURE',
      heading: 'आपके wearable का डेटा किसी और की क्लाउड प्रॉपर्टी नहीं बनना चाहिए।',
      lead: 'लोकल डेटाबेस, मास्क किए गए पहचानकर्ता और अलग-थलग स्रोत — यही डिफ़ॉल्ट है। AI चाहिए तो आप तय करते हैं कि क्या बाहर जाए और कहाँ उतरे।',
      points: [
        { icon: 'database', label: 'लोकल SQLite स्टोरेज' },
        { icon: 'profile', label: 'अकाउंट ID डिफ़ॉल्ट रूप से मास्क' },
        { icon: 'cloud-output', label: 'एक्सपोर्ट सिर्फ़ आपके ट्रिगर पर' },
      ],
      vault: 'आपके हेल्थ डेटा को आगे भेजने वाला कोई ZeppBridge बैकएंड है ही नहीं।',
    },
    footer: {
      tagline: 'ओपन-सोर्स Amazfit डेटा ब्रिज · Windows और Mac (Apple Silicon)',
      disclaimer: 'एक स्वतंत्र, गैर-आधिकारिक ओपन-सोर्स प्रोजेक्ट; Zepp Health, Huami या Amazfit से कोई संबंध या समर्थन नहीं। केवल उन अकाउंट और डेटा के लिए जिन तक पहुँचने का अधिकार आपको है।',
      download: 'डाउनलोड',
    },
  },
  meta: {
    title: 'ZeppBridge · लोकल डेटा ब्रिज',
    description:
      'ZeppBridge Amazfit / Zepp wearable डेटा के लिए लोकल-फ़र्स्ट, ओपन-सोर्स ब्रिज और व्यूअर है। आपके अपने Windows, Mac या Linux कंप्यूटर पर चलता है।',
    ogTitle: 'ZeppBridge · आपका Zepp डेटा, पूरा वापस',
    ogDescription:
      'अपने कंप्यूटर पर Amazfit wearable डेटा कनेक्ट, व्यवस्थित और विज़ुअलाइज़ करें। स्रोत बरकरार रहते हैं, और जब तक आप न भेजें कुछ बाहर नहीं जाता।',
  },
};

export default pack;
