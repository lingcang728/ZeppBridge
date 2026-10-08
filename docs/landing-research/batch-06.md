# Landing-page research — batch 06

Collected 2026-10-07 (Asia/Taipei). Scope: 10 primary brands plus ZeroGPT supplemental. Research used official live pages, agent-reach web search and Jina Reader, and a fresh isolated headless Playwright session at 1440×1000. The existing cached Chromium 1208 was selected because the installed Playwright package requested a different cached revision. No accounts were used and no product actions were submitted. The identity audit below uses the current official a16z 7th-edition article, published 2026-10-05.

Raw artifacts are in `C:\Users\15pro\AppData\Local\Temp\landing-research\batch-06`. Each rendered brand has `*-first-screen.png`, `*-full-page.png`, and a `.json` DOM/computed-style snapshot; Gemini’s rendered marketing page is `gemini-about-first-screen.png`, `gemini-about-full-page.png`, and `gemini-about.json`. Jina text snapshots are stored beside them as `.md`. These are dated captures, not proof of universal availability. No performance benchmark, keyboard audit, or screen-reader audit was run.

## Coverage

| Entry | Official URL(s) | Coverage | Evidence note |
|---|---|---|---|
| ChatGPT | [chatgpt.com](https://chatgpt.com/), [home-page help](https://help.openai.com/en/articles/9125172-the-chatgpt-home-page) | text-only / browser blocked | Chromium got HTTP 403 “Please wait”. Jina returned current first-screen and nav text; visual layout and motion unknown. |
| CapCut | [capcut.com](https://www.capcut.com/) | rendered | HTTP 200; first screen, full page, nav, computed heading styles, and CSS animation snapshot. |
| Gemini | [gemini.google/about](https://gemini.google/about/), [app](https://gemini.google.com/app) | rendered | Marketing page rendered in Traditional Chinese; app redirected to `/app` and rendered in Simplified Chinese. Two viewport sets and computed type captured. |
| AI Gallery | [a16z 7th-edition mobile entry](https://a16z.com/100-gen-ai-apps-7/), [chart-linked App Store listing](https://apps.apple.com/us/app/ai-gallery/id1665221706) | text-only; site identity ambiguous | a16z links the chart entry to Apple app ID 1665221706, whose listed developer is Inderjeet Singh. The captured `aigallery.app` has no evidenced connection to that developer or listing, so its rendered page is excluded as a namesake, not treated as the chart product. The App Store page itself redirected the browser to the regional Today page; official App Store text was available through Jina. |
| Microsoft Copilot | [copilot.com](https://copilot.com/), [Microsoft consumer overview](https://www.microsoft.com/en-us/microsoft-copilot/for-individuals/) | rendered | `copilot.microsoft.com` redirected to `copilot.com`; HTTP 200 with product landing page, heading CSS, FAQ and motion snapshot. |
| Doubao | [doubao.com](https://www.doubao.com/), [official About](https://www.doubao.com/about) | rendered | Homepage redirected to `/chat/`; current Chinese chat entry captured. Official About page also text-read for product feature hierarchy. |
| Picsart | [picsart.com](https://picsart.com/), [AI photo editor](https://picsart.com/ai-photo-editor/) | rendered | HTTP 200; current homepage screenshot/DOM and computed styles. This homepage currently presents a broad creative platform. |
| Dola | [a16z 7th-edition mobile entry](https://a16z.com/100-gen-ai-apps-7/), [chart-linked App Store listing](https://apps.apple.com/ae/app/dola-smart-ai-assistant/id6451431247), [dola.com](https://www.dola.com/) | rendered; chart identity verified | a16z links Dola to Apple app ID 6451431247; its App Store page names SPRING (SG) PTE. LTD. and links directly to the same `dola.com` Terms and Privacy pages, which name the service provider. The rendered site root redirected to `/chat/`. |
| Microsoft Edge | [microsoft.com/edge](https://www.microsoft.com/edge) | rendered | Redirected to Microsoft’s localized Edge landing page; HTTP 200. Page hierarchy, navigation, and computed heading styles captured. |
| Meituan | [meituan.com](https://www.meituan.com/) | rendered | Official corporate homepage, HTTP 200; Chinese rendered copy, navigation, news hierarchy, typography, and cookie prompt captured. |
| ZeroGPT (supplemental) | [zerogpt.com](https://www.zerogpt.com/), [pricing](https://www.zerogpt.com/pricing) | rendered | HTTP 200; homepage upload field, tools, page hierarchy, styles, and CSS animation snapshot. Claims on the page are reported as marketing copy, not validated results. |

## Per-site observations

### ChatGPT

**Observed from official text only:** the current first-screen copy is “What are you working on? Where should we begin?” with a direct chat entry. The extracted nav has New chat, Images, Plugins, Deep research, plans/pricing, Help and Settings; the visible sign-in path promotes saved-chat context, file/image upload and additional tools. Official help says logged-out chat is available only in supported regions and that saving chats requires an account. Chromium stopped at a 403 gate, so no visual layout, typography, spacing, or motion claim is made. The page explains current controls and limitations in a short, action-first sequence; the richer app features remain subordinate to starting a conversation. Keyboard and performance behavior were not tested.

**Transfer:** lead with a usable sample archive or one direct “Explore sample data” action. Treat the real interface as proof of the product, then explain account/data boundaries nearby. Do not imply ChatGPT’s login-free availability model applies to ZeppBridge.

Sources: [ChatGPT homepage](https://chatgpt.com/), [official home-page help](https://help.openai.com/en/articles/9125172-the-chatgpt-home-page), [ChatGPT FAQ](https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq).

### CapCut

**Observed, rendered:** the first screen says “AI-Powered Photo & Video Editor for Everyone”, followed by a short creator-use promise and two clear routes: “Try online for free” and “Download”; “No credit card required” reassures beneath. The media demo begins below a spacious centered hero. The nav separates Products, Features, Blog, Templates and Discover; within Features it groups AI creation, video, image, text/audio tools, use cases, resources and templates. The homepage acts as a large discovery hub; individual editor, generator, template and download pages take visitors to focused tasks.

**Typography/layout/motion:** computed hero type is “Inter SemiBold”, 72px/600 with 79.2px line height; section heads are 40px then 36px/600. Very large whitespace puts the promise and CTA ahead of an interactive-looking demo. At capture, the demo frame was mostly blank, so I cannot confirm its playback or interaction. The CSS probe found a header scroll-blur animation; no other active animation was returned in the sampled elements. No accessibility or performance checks were run.

**Transfer:** keep the two meaningful entry routes (sample and download) visible, then use a few task-based feature sections. CapCut’s repeated tool inventory, trend funnels, marketing claims, and nested nav scale with a much broader creative suite and would overwhelm ZeppBridge.

Sources: [homepage](https://www.capcut.com/), [online editor](https://www.capcut.com/tools/online-video-editor), [download page](https://www.capcut.com/tools/video-editor-download).

### Gemini

**Observed, rendered:** the official About page’s headline is “Building the world’s most capable AI assistant” with a “Try Gemini” action. It then moves through video generation, a redesigned interface, a personal agent, Gemini Live, and a plan comparison before social proof and more discovery links. Top-level responsibilities group features, productivity, subscriptions, news and desktop. Feature-specific overview pages explain Gemini Live, Gems, Chrome, Deep Research and other capabilities. The current Taiwan-localized page includes availability and subscription caveats; this is a useful example of placing region, account and plan details within the offer itself, not a universal promise.

The second rendered surface, `gemini.google.com/app`, redirected to the app and showed “与 Gemini 对话” with sign-in and a conversation composer. Its locale was Simplified Chinese, while the marketing capture was Traditional Chinese. I treat the About page as the marketing reference and the app capture only as product-entry evidence.

**Typography/layout/motion:** computed marketing H1 is Google Sans, 72px/400. The page uses a long scroll with distinct product themes and a substantial plan matrix. The DOM snapshot reported three short CSS animations (one-second CTA/watermark names and a 0.3-second modal exit); this does not establish scroll or media behavior. No accessibility or performance audit was run.

**Transfer:** a short headline, direct CTA and benefit-led feature chapters fit ZeppBridge. Borrow the practice of stating availability or account caveats next to the relevant feature; keep AI clearly optional and explain the external handoff before use. The paid-plan comparison is irrelevant to the current free product.

Sources: [Gemini About](https://gemini.google/about/), [Gemini app](https://gemini.google.com/app), [Gems overview](https://gemini.google/us/overview/gems/?hl=en), [Deep Research overview](https://gemini.google/overview/deep-research/?hl=in).

### AI Gallery

**Chart product identity:** the official [a16z 7th-edition article](https://a16z.com/100-gen-ai-apps-7/) lists AI Gallery in its mobile-app links and points that label to the Apple App Store listing `id1665221706`. The listing names the product “AI Gallery”, tagline “Unleash the Power of AI Art”, and developer/seller Inderjeet Singh. It describes text-to-image, image-to-image, browsing a gallery, and a paid subscription; Terms and Privacy links point to the developer’s `inder-ios.blogspot.com` pages. Apple says the developer’s privacy information has not been verified by Apple. The article-to-store link establishes the chart product identity; it does not provide evidence that the separate `aigallery.app` website belongs to this publisher. The exact chart-linked store item is identified, but the page text does not let me compare a separate chart-logo graphic pixel-for-pixel. This is the strongest official publisher/store match for the chart entry.

**Ambiguous same-name website:** `aigallery.app` was the rendered candidate from the original collection pass, but its About/footer identify a separate browser product and do not name Inderjeet Singh or link to the chart-linked App Store app. I found no official source connecting them. I therefore mark the relationship ambiguous and exclude that website’s hero, typography, motion and local-storage claims from this mobile app’s observations. Its screenshots/DOM remain in the evidence folder only as an unassociated namesake capture. The two other store products previously checked are different listings: MesaSoft’s Android “AI Gallery - Offline AI Chat” and WAILI LIMITED’s iPhone “AI Gallery: AI image generator”.

**Storefront evidence and limits:** the chart-linked App Store page’s text presents a store shell with product tagline, category/rating, developer, app screenshots, feature description, version history and privacy section. The app’s own first-run screen, in-app CTA, typography, animation and app navigation are not evidenced by this storefront text. A separate headless-browser visit to the App Store URL redirected to a regional Today page, so no product-page visual or motion claim is made; the captured `ai-gallery-appstore-*` files are redirect diagnostics only. Apple’s listing does not show a developer website; the published policy URLs are the only linked developer materials found. Apple also reports no accessibility features submitted by the developer. No app runtime, keyboard or performance audit was possible.

Sources: [a16z mobile entry and chart-linked App Store URL](https://a16z.com/100-gen-ai-apps-7/), [exact App Store product](https://apps.apple.com/us/app/ai-gallery/id1665221706), [developer privacy page](https://inder-ios.blogspot.com/2023/06/ai-gallery-privacy-policy_11.html), [unconnected same-name site](https://aigallery.app/about/).

### Microsoft Copilot

**Observed, rendered:** “Think it. Build it. Do it with Copilot.” is followed by one sentence about answers, content creation and tasks, then Sign in. “One Copilot for every part of your day” branches into Work, Life and School and three small tasks: chat, search and creation. Later sections explain desktop/mobile entry and FAQ-style changes. The nav stays short—Features, Download, Plans and Pricing—while individual task cards link to Chat, Search, Create and desktop/mobile use. A “Did you know?” accordion covers feature names, account continuity and data controls. The page states that features vary by subscription and account; its footer also discloses Microsoft Clarity behavioral insights.

**Typography/layout/motion:** the H1 uses SegoeSerifDisplay, 72px/400, 75.6px line height; section H2s use Segoe Sans, 40px/400, 48px line height. A single short `copilotcomHeroReveal` animation (0.2s) was active at the snapshot. The DOM includes “Skip to main content”; I did not test keyboard behavior, Clarity behavior, contrast, reduced motion or performance.

**Transfer:** organize feature explanations by the visitor’s question (view, connect, export, protect), and put limitations adjacent to those actions. Avoid a suite-sized Plans/Pricing destination or prompting users to sign in when ZeppBridge requires no service account.

Sources: [Copilot](https://copilot.com/), [Microsoft Copilot for individuals](https://www.microsoft.com/en-us/microsoft-copilot/for-individuals/), [Microsoft help: Copilot app](https://support.microsoft.com/en-us/microsoft-365-copilot/what-is-microsoft-copilot-app).

### Doubao

**Observed, rendered:** the official homepage redirected into the Simplified-Chinese chat surface at `/chat/`. The entry field asks “有什么我能帮你的吗？” and immediately presents suggested questions, plus “对话” and “工作” modes and task chips for PPT, image generation, writing, video, transcription and music. The app nav groups new task/chat, API, more, recents and About Doubao; a prominent sign-in and subscription offer also appeared. Because the landing URL enters the product shell, the first-screen pitch is the composer and suggested tasks rather than a separate marketing hero. The official About page text-read separately groups writing, images, search, music and multi-scenario tasks with “立即体验” links; these capability details lead into task-specific product experiences.

**Typography/layout/motion:** the captured shell contains no H1; the small “为你推荐” H2 is 12px/400, which does not represent the composer’s type scale. The font family for the headline/prompt was not measured. CSS showed repeated 5.6-second text/offer flip animations. The page publishes keyboard shortcuts for new task and new chat. No keyboard, reduced-motion or performance testing was performed.

**Transfer:** task starters can make a product’s scope tangible; ZeppBridge could show fixed examples such as “view a month” or “export a record” in a sample archive. Keep sample data and fixed copy; do not make health-data interpretation sound like a chatbot diagnosis.

Sources: [Doubao homepage](https://www.doubao.com/), [official About](https://www.doubao.com/about).

### Picsart

**Observed, rendered:** the current hero is “Make videos, images, and audio for every channel” with a one-line creator proposition and “Start creating”. The page moves straight into model/tool cards and “Get started” actions, then trending effects, template examples, workflows, creator/community material and product detail. Navigation is grouped into Video, Image, Agents, Popular, Assets, Plugins, Solutions, Community, Pricing and a create action. A large number of editorial trend cards expose focused effect/template pages; the homepage acts as a creative platform launcher rather than a single-tool overview.

**Typography/layout/motion:** computed hero style is Acorn-Regular, 42px/500, 50px line height; many feature headings are Mulish 30px/500, while some section heads use Acorn around 41–42px/400. The first screen is dark with many bright controls and carousel-like creative previews. The CSS probe found no active CSS animation on sampled nodes at capture time; video/JS activity and hover behavior were not assessed. No accessibility or performance audit was run.

**Transfer:** concrete task cards are easier to understand than abstract “platform” claims. Use a small set of real ZeppBridge operations/screenshots. Reject the many trend tiles, conversion-focused CTA repetition and upsell/navigation density.

Sources: [homepage](https://picsart.com/), [AI photo editor](https://picsart.com/ai-photo-editor/), [apps](https://picsart.com/apps/).

### Dola

**Identity and observed product:** the [a16z 7th-edition mobile entry](https://a16z.com/100-gen-ai-apps-7/) links Dola to the Apple App Store product `id6451431247`, “Dola: Smart AI Assistant”. The store lists SPRING (SG) PTE. LTD. as developer and links directly to `dola.com/legal/terms/en` and `dola.com/legal/privacy/en`; the Terms identify the same company as service provider. This establishes the chart-linked product and its official web domain. The official download page says “Your all-in-one AI assistant” and links to “Try It Now”.

The live root redirected to `/chat/` and rendered a Simplified-Chinese conversation screen, not a long marketing page. It presents a new-chat command, AI creation and About Dola in a narrow sidebar; the center asks “有什么我能帮你的吗？” with a sign-in action. A cookie consent panel is prominent and links to policy. The single conversation canvas is the homepage; AI creation is the adjacent specialized route. Detailed marketing feature breadth was not established from the rendered root, so no additional feature taxonomy is inferred.

**Typography/layout/motion:** no H1/H2 element was detected in the app shell; no headline family or scale is claimed. The capture reported repeated two-second `pulse` animations on loading/placeholder nodes. It also showed Terms and Privacy adjacent to sign-in. The consent text explains cookies for service, safety and analytics, with an “I understand” action. No keyboard, reduced-motion, contrast or performance audit was run.

**Transfer:** put consent and privacy details next to the action that needs them; for ZeppBridge, show AI data-transfer disclosure only at its deliberate optional handoff. Do not borrow a login-first flow.

Sources: [a16z mobile entry and chart-linked App Store URL](https://a16z.com/100-gen-ai-apps-7/), [exact App Store product](https://apps.apple.com/ae/app/dola-smart-ai-assistant/id6451431247), [Dola](https://www.dola.com/), [download](https://www.dola.com/download/mobile), [Terms](https://www.dola.com/legal/terms/en), [Privacy](https://www.dola.com/legal/privacy/en), [Google Play listing](https://play.google.com/store/apps/details?id=com.larus.wolf).

### Microsoft Edge

**Observed, rendered:** `microsoft.com/edge` redirected to the localized Microsoft Explore Edge page. The hero line is “从这里开始，在这里完成” (“Start here, finish here”) with “试用 Edge”. The nav groups Features, Mobile, Copilot, Search, Business, Resources and Download. Scrolling proceeds through Copilot, AI capabilities, performance, security, cross-device continuity, gaming, new features, Edge integrations and device downloads. Specific subjects have “了解详细信息” destinations, so the homepage is a broad overview with separate detail pages. The page includes availability/market footnotes next to feature claims.

**Typography/layout/motion:** no H1 was detected; the hero is an H2 at Segoe VF, about 68.2px/400 and 73.7px line height. Section headings are about 39.8px/400; card headings about 22.7px/600. The computed animation probe found only repeated loading spinners, not active marketing animation. A “skip to main content” link is present. No performance, keyboard, screen-reader or reduced-motion audit was run.

**Transfer:** the section order (what it does, security, sync, download) is a good model for explaining ZeppBridge from immediate use through trust and install. Retain only product-relevant topics; Edge’s ecosystem/business/ads cross-links belong to a broad browser suite.

Sources: [Microsoft Edge](https://www.microsoft.com/edge), [Microsoft Edge support](https://support.microsoft.com/en-US/edge/troubleshooting-tips-for-downloading-installing-and-updating-microsoft-edge).

### Meituan

**Observed, rendered:** this is the official corporate homepage, not the consumer ordering experience. Its hero calls Meituan a “科技零售公司” (technology retail company), explains the mission and retail-plus-technology strategy, and offers “下载美团App”. Top navigation separates partnership, technology, CSR, philanthropy, disclosure, investor relations and careers. “最新动态” then lists dated company/news items, followed by App/social download and corporate footer details. The home page is the institutional front door; business and responsibility topics have distinct sections/destinations.

**Typography/layout/motion:** H1 computed as MTTiJ / Chinese system sans fallback, 52px/500 with 72px line height; H2 “最新动态” is 28px/500, 40px line height. No active CSS animation appeared in the sampled elements. A cookie preference prompt appears over the page with accept, reject and learn-more choices. No accessibility/performance test was run.

**Transfer:** clear, dated updates and straightforward category names support credibility. A ZeppBridge release/update area should only appear if actively maintained and should separate product documentation from release news. Meituan’s corporate scale and multi-stakeholder menu are not needed for one desktop utility.

Sources: [official corporate homepage](https://www.meituan.com/).

### ZeroGPT (supplemental)

**Observed, rendered:** the first screen presents itself as an AI detector and places a text area, file upload and 15,000-character counter directly below the headline, with a “Get Started” path. The nav groups Products, Pricing, API and FAQ; below the composer it adds a tile grid for related tools, accuracy messaging, technology detail, API and FAQs. AI detector, image/video detector, paraphraser, grammar, summaries and paid plans have separate destinations. The site reports numeric accuracy and false-positive claims, but I did not independently validate them and they should not be treated as established facts.

**Typography/layout/motion:** system UI stack; H1 27px/700; sampled H2s range from 20.5px/700 to 36px/700. The first screen is form-led and relatively dense. One six-second spin animation appeared in the snapshot. No accessibility/performance audit was run.

**Transfer:** a visible text-length limit and direct file-format/action requirements can reduce uncertainty in a tool workflow. Do not borrow detector accuracy language, “trusted by millions” positioning, or a broad tool upsell; ZeppBridge has no comparable validated claims or AI service.

Sources: [homepage](https://www.zerogpt.com/), [pricing](https://www.zerogpt.com/pricing), [AI video detector](https://www.zerogpt.com/ai-video-detector).

## Cross-site principles for ZeppBridge

1. Start with a concrete user promise and one direct next step. CapCut, ChatGPT and Copilot all make the first action legible; ZeppBridge’s sample archive can demonstrate value before a download decision.
2. Put actual product evidence near the promise. Use the existing sample-data app as the proof point, then provide a clear route to install the desktop build.
3. Organize the long page around user questions and benefits. Edge and Copilot sequence capability themes into readable chapters; ZeppBridge’s five scroll beats can stay focused on sample, ownership, connection, export and download.
4. Describe data movement in plain language. For ZeppBridge, name local storage, optional user-initiated AI handoff, and what is never fabricated; the unrelated `aigallery.app` page is not evidence about the chart-linked AI Gallery app.
5. Put conditions beside the relevant offer. Gemini/Edge show feature availability caveats in context; ZeppBridge should clarify platform support and health-data missing-value rules near the relevant demonstration/export.
6. Keep navigation proportional to the product. Broad suites divide tools across many pages; ZeppBridge needs a few durable destinations and direct language.
7. Use motion only to clarify a real state. Doubao animates changing suggestions; ZeppBridge should keep sample data stable and interactions user-directed so the missing-sample contract stays visually trustworthy.
8. Make opt-in and privacy visible at the point of action. Dola and Meituan surface consent/privacy controls; ZeppBridge’s optional AI explanation belongs beside the handoff button, without adding a mandatory account.

## Strongest references

- **Microsoft Edge — section hierarchy:** a concise hero followed by focused security, cross-device and download sections maps well to ZeppBridge’s story, provided the scope stays small.
- **Microsoft Copilot — user-task grouping:** its work/life/school and chat/search/create groups show how to connect capabilities to user questions; ZeppBridge can group around view, connect, export and protect.
- **Gemini — feature chapters and availability notes:** short, visually distinct feature themes plus nearby plan/region caveats provide a useful pattern for explaining where ZeppBridge works and what each connection option supports.

## Patterns to reject

- Suite-scale mega menus, partner cross-sells, trend grids and repeated “start now” cards from CapCut/Picsart.
- Login-first or subscription-led assistant paths from Dola/Doubao where they conflict with ZeppBridge’s local-first, no-account path.
- Auto-cycling prompt copy, as seen on Doubao, that makes a stable health record feel transient or hides the fixed missing-data contract.
- Unsupported accuracy, user-count or testimonial claims; ZeroGPT’s published metrics and other sites’ marketing proof are not independent evidence for ZeppBridge.
- Treating local-first as local-only. State when optional processing leaves the device and who receives it, as required by ZeppBridge’s own product contract.

## Concrete transfer suggestions

- Keep the current sample-data experience prominent, and label it as sample data so the initial demo cannot be mistaken for the visitor’s own archive.
- Give the first screen one calm statement about ownership/local archive, a short supporting sentence, and two clear actions: explore the sample and download ZeppBridge.
- Preserve the five existing scroll beats, using explicit section titles and short chapter transitions; connect each visual to a real operation in the current product.
- Put a compact data-flow diagram at the privacy beat: device ↔ watch/phone/health source; optional user-chosen AI handoff shown separately with destination and scope.
- State “missing remains missing” beside relevant charts/export examples. Never use zeros, carried-forward values or estimates as visual filler.
- Keep navigation limited to the sample, how it works, privacy/data, download and help/release details; use localized labels consistently.
