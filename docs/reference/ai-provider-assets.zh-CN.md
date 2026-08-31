# AI 提供商本地图标来源

[English](ai-provider-assets.md)

交接地址是代码内固定的 HTTPS allowlist（不接受用户输入、query 或 fragment）：
`https://chatgpt.com/`、`https://claude.ai/`、`https://gemini.google.com/app`、
`https://www.kimi.com/`、`https://www.doubao.com/chat/`、
`https://chat.deepseek.com/`、`https://grok.com/`。Tauri Opener 只允许这七个地址；
图标在构建时随应用打包，运行时不向第三方 CDN 热链。

以下资源均来自对应 AI 产品站点自身的 favicon/app-icon 资源（不是母公司
corporate logo）。获取日期：2026-08-15（Asia/Shanghai）。PNG/WebP 字节以
SHA-256 固定，校验脚本为 `scripts/assets/verify-ai-assets.py`。

| 提供商 | 本地文件（格式/尺寸） | 最终资源 URL | 本地 SHA-256 | 许可/商标说明 |
| --- | --- | --- | --- | --- |
| ChatGPT | `src/assets/ai/chatgpt.webp` (WebP 48×48) | [chatgpt.com favicon WebP](https://chatgpt.com/cdn/assets/favicon-48x48-glnpepm0.webp) | `3481F245B6D560F855E49A16FC66EE7FDEC2DEE4115949179B113839149A9649` | 官方 ChatGPT 产品 favicon；版权/商标归 OpenAI，按产品识别用途随应用本地使用，不主张额外许可 |
| Claude | `src/assets/ai/claude.png` (PNG 32×32) | [Claude 官方 favicon PNG](https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/ce67964e7-CAX1bqSh.png) | `F9B8A3B95FA7EF7CFD3C91E170260CCD3215E575BF45F347FEC0F0A94BA11161` | Anthropic/Claude 官方产品图标；版权/商标归权利人，限于指向 Claude 服务的识别用途 |
| Gemini | `src/assets/ai/gemini.png` (PNG 512×512) | [Gemini 官方 favicon PNG](https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png) | `5E7CFECAA53F4F65A313FE89B0F389548126544A78FAD8489510C70AE641A4A1` | Google Gemini 官方产品图标；版权/商标归 Google，限于指向 Gemini 服务的识别用途 |
| Kimi | `src/assets/ai/kimi.png` (PNG 48×48，官方 ICO 无损转 PNG) | [Kimi 官方浅色 favicon ICO](https://www.kimi.com/favicon-light.ico) | `280D3A7AB31357BCB4CB25A7C8D8EBCEAC5F6646D76AD5DE25E7E1C5E00CF340` | Kimi 官方产品 favicon；本地仅做格式转换以避免 WebView ICO/SVG 差异，商标/版权归 Moonshot AI |
| 豆包 | `src/assets/ai/doubao.png` (PNG 128×128) | [豆包官方 CDN 产品图标](https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/128x128.png) | `BF8E41BCC864C00099A98080825EA42ABA7CF481303DAD3312F44A5DA68C3F3B` | 豆包产品图标由官方页面引用；版权/商标归字节跳动/豆包，限于服务识别用途 |
| DeepSeek | `src/assets/ai/deepseek.png` (PNG 180×180) | [DeepSeek 官方 chat app icon](https://fe-static.deepseek.com/chat/icon-180.png) | `547EAD56DCB71424315BA53BF8F4C35E745EFEAECE106B9FB7E4DCDFA19C1A7A` | DeepSeek 官方应用图标；版权/商标归 DeepSeek，限于指向 DeepSeek 服务的识别用途 |
| Grok | `src/assets/ai/grok.png` (PNG 512×512) | [Grok 官方站点 app icon](https://grok.com/images/android-chrome-512x512.png) | `3A462C3C2524733C173BB05C431DE737812F8219DB8FA115B0025D12A347E086` | Grok 产品站点图标（不是 xAI corporate 标志）；版权/商标归 Grok/xAI，限于指向 Grok 服务的识别用途 |

图标加载失败时，Explore 选择器才显示无障碍首字母/汉字 fallback；正常路径始终
渲染上述七个本地产品图标。设备卡片在商品 WebP 加载失败时使用代码内原创轮廓，
不会让折行的 `alt` 文本冒充图片。
