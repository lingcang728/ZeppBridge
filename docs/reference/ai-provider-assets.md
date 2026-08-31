# Provenance of the local AI provider icons

[简体中文](ai-provider-assets.zh-CN.md)

The hand-off destinations are an HTTPS allow-list fixed in code (no user input,
query or fragment is accepted): `https://chatgpt.com/`, `https://claude.ai/`,
`https://gemini.google.com/app`, `https://www.kimi.com/`,
`https://www.doubao.com/chat/`, `https://chat.deepseek.com/`,
`https://grok.com/`. Tauri Opener permits only those seven addresses; the icons
are bundled with the app at build time and are never hot-linked from a
third-party CDN at runtime.

Every asset below comes from the corresponding AI product site's own
favicon/app-icon resource — not the parent company's corporate logo. Retrieved
2026-08-15 (Asia/Shanghai). The PNG/WebP bytes are pinned by SHA-256, and the
verification script is `scripts/assets/verify-ai-assets.py`.

| Provider | Local file (format/size) | Source URL | Local SHA-256 | Licence / trademark note |
| --- | --- | --- | --- | --- |
| ChatGPT | `src/assets/ai/chatgpt.webp` (WebP 48×48) | [chatgpt.com favicon WebP](https://chatgpt.com/cdn/assets/favicon-48x48-glnpepm0.webp) | `3481F245B6D560F855E49A16FC66EE7FDEC2DEE4115949179B113839149A9649` | The official ChatGPT product favicon; copyright/trademark belongs to OpenAI, used locally within the app for product identification only, with no additional licence claimed |
| Claude | `src/assets/ai/claude.png` (PNG 32×32) | [Claude official favicon PNG](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/ce67964e7-CAX1bqSh.png) | `F9B8A3B95FA7EF7CFD3C91E170260CCD3215E575BF45F347FEC0F0A94BA11161` | The official Anthropic/Claude product icon; copyright/trademark belongs to the rights holder, limited to identifying the Claude service |
| Gemini | `src/assets/ai/gemini.png` (PNG 512×512) | [Gemini official favicon PNG](https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png) | `5E7CFECAA53F4F65A313FE89B0F389548126544A78FAD8489510C70AE641A4A1` | The official Google Gemini product icon; copyright/trademark belongs to Google, limited to identifying the Gemini service |
| Kimi | `src/assets/ai/kimi.png` (PNG 48×48, losslessly converted from the official ICO) | [Kimi official light favicon ICO](https://www.kimi.com/favicon-light.ico) | `280D3A7AB31357BCB4CB25A7C8D8EBCEAC5F6646D76AD5DE25E7E1C5E00CF340` | The official Kimi product favicon; converted locally only to avoid WebView ICO/SVG differences. Trademark/copyright belongs to Moonshot AI |
| Doubao | `src/assets/ai/doubao.png` (PNG 128×128) | [Doubao official CDN product icon](https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/128x128.png) | `BF8E41BCC864C00099A98080825EA42ABA7CF481303DAD3312F44A5DA68C3F3B` | The Doubao product icon referenced by the official page; copyright/trademark belongs to ByteDance/Doubao, limited to service identification |
| DeepSeek | `src/assets/ai/deepseek.png` (PNG 180×180) | [DeepSeek official chat app icon](https://fe-static.deepseek.com/chat/icon-180.png) | `547EAD56DCB71424315BA53BF8F4C35E745EFEAECE106B9FB7E4DCDFA19C1A7A` | The official DeepSeek app icon; copyright/trademark belongs to DeepSeek, limited to identifying the DeepSeek service |
| Grok | `src/assets/ai/grok.png` (PNG 512×512) | [Grok official site app icon](https://grok.com/images/android-chrome-512x512.png) | `3A462C3C2524733C173BB05C431DE737812F8219DB8FA115B0025D12A347E086` | The Grok product site icon (not the xAI corporate mark); copyright/trademark belongs to Grok/xAI, limited to identifying the Grok service |

The accessible initial-letter fallback appears in the Explore picker only when an
icon fails to load; the normal path always renders the seven local product icons
above. Device cards fall back to an original outline drawn in code when the
product WebP fails to load, rather than letting wrapped `alt` text pose as an
image.
