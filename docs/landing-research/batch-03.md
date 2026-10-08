# Landing-page research — batch 03

Collected 2026-10-07 (Asia/Taipei). Scope: 10 primary entries plus Z.ai supplemental. I used official homepages/product routes, agent-reach Jina Reader where it returned usable material, official search-indexed snippets for identity/page discovery, and an isolated headless Microsoft Edge 154 session at 1440×1000. No account was created or logged into. Pages were sampled at first paint and after scrolling to about 1,100 px; this is a desktop snapshot, not a complete cross-device audit.

Raw evidence (screenshots, DOM summaries, and Jina text snapshots/errors) is in `%TEMP%\zeppbridge-landing-batch-03` (absolute path: `C:\Users\15pro\AppData\Local\Temp\zeppbridge-landing-batch-03`). `*-initial.png` is the first viewport, `*-scroll.png` a sampled scroll position, `*-full.png` a full-page capture, `.json` files contain page status, visible headings with computed font data, navigation/link text, video/image and sampled CSS animation data, and `*-jina.md` files are the reader snapshots. The evidence files are temporary and dated; changing pages, regional variants, consent state and A/B tests can alter the experience.

## Coverage

| Entry | Official URL | Coverage | Evidence note |
|---|---|---|---|
| Descript | [descript.com](https://www.descript.com/) | rendered | HTTP 200; hero and lower sections, menu, headings/fonts, media and links captured. |
| Zeely | [zeely.ai](https://zeely.ai/) | rendered | HTTP 200; long marketing page with ad examples, section hierarchy, nav and computed display type. |
| HeyGen | [heygen.com](https://www.heygen.com/) | rendered | HTTP 200; large video-led page and product, trust, FAQ and footer sections captured. |
| Jumpspeak | [jumpspeak.com](https://www.jumpspeak.com/) | rendered | HTTP 200; minimal nav, hero, language-practice examples and scroll content captured. |
| Runway | [runway.com](https://runway.com/) | rendered | HTTP 200; current homepage is branded around Real-World Intelligence; product/research/API links captured. |
| Kling | [kling.ai](https://kling.ai/) | rendered | HTTP 200; hero video, generation prompt CTA, feature and developer/resource taxonomy captured. |
| Topaz Labs | [topazlabs.com](https://www.topazlabs.com/) | rendered | HTTP 200; black product homepage rendered with a large Cookiebot consent panel obscuring part of the content. Official search-index text and page links supplement the capture. |
| InVideo | [invideo.io](https://invideo.io/) | rendered | HTTP 200; current homepage title and prompt-based hero rendered; feature/model routes present. |
| Topview | [topview.ai](https://www.topview.ai/) | rendered | HTTP 200; video-agent hero, tool/model entry points and long feature hierarchy captured. |
| Gamma | [gamma.app](https://gamma.app/) | blocked | Browser returned HTTP 403 and Cloudflare “Just a moment” verification; Jina returned a challenge. Only the official search-index result identifies its broad presentation/website-maker positioning. Visual, type and motion details are unknown. |
| Z.ai (supplemental) | [z.ai](https://z.ai/) | rendered product UI; marketing page unavailable | Official root redirected to `chat.z.ai`; the page showed the GLM chat composer and examples. Jina reported temporary unavailability. This supports chat-workbench observations, not a complete corporate landing-page audit. |

## Per-site observations

### Descript

**Observed, rendered:** the hero is a maroon, centered statement, “AI-editing for every kind of video,” with a short explanation of editing via text and a bright “Get started for free” CTA. A product mockup begins below the CTA. The page then shows proof/customer stories, a five-step “Record / Edit / Refine / Share / Multiply” workflow, tool categories, enterprise controls, reviews, FAQ and a final CTA. This turns a broad editor into a sequential workflow before exposing its long feature list. The header groups Features, Underlord, Solutions, Resources and Pricing; Contact sales, Sign in and Sign up are separated on the right. Feature mega-menu links name practical jobs such as video editing, podcasting, screen recording, enhancement, captions and transcription. Individual feature pages and team/use-case pages sit below the homepage; Underlord has its own page and the enterprise offer has a separate destination.

**Typography and motion:** browser-computed hero section heading is `gamuthDisplay` at 88 px / weight 400; following major headings use the same display face around 56 px and the workflow subheads around 40 px. The visible small “AI VIDEO EDITOR” eyebrow is the DOM H1 at 18 px / 400 in `brett`; the main marketing title is an H2, so the visual hierarchy and semantic H1 do not align in this capture. Body text uses `booton`, 16 px. Six video elements appeared in the DOM and several product-demo panels were visible; the sampled CSS animation list did not show named animations. This indicates video content, not that all clips autoplay or meet reduced-motion preferences.

**Accessibility/performance observation:** the long page has a substantial feature and FAQ hierarchy. The browser did not run a keyboard, contrast, screen-reader or Web Vitals audit. Image loading was sampled only in the current viewport/session; it is not a page-speed score.

**ZeppBridge transfer:** use a short workflow sequence to explain import → archive → explore → export, and keep deeper connection/export details on dedicated pages. Preserve the plain-language benefit and show the actual product early. Avoid importing the large creative-tool catalogue.

Copy cue: “editing is as easy as using docs and slides” is a compact analogy that names a familiar action.

Sources: [homepage](https://www.descript.com/), [video editing](https://www.descript.com/video-editing), [Underlord](https://www.descript.com/underlord), [enterprise](https://www.descript.com/enterprise).

### Zeely

**Observed, rendered:** the first screen makes a performance-marketing promise (“Create, launch and scale winning ads with AI”), places a short explanation underneath, then uses a large prompt-shaped module and a horizontal gallery of sample ads to demonstrate the output. Black CTA buttons, a white field and subtle dotted background make the prompt the visual anchor. The scroll moves through the full marketing cycle: video ads, image ads, campaign launch/analytics, organic trend content, scheduling, creative examples and an AI agent. The top navigation is a dense task/SEO taxonomy spanning ad formats, platforms, niches, AI marketing tools, About, Pricing, Blog, Resources, Help and Log in. Product pages such as video ad, static ad and avatar pages are separated by task/channel; the homepage tries to be a broad index into them.

**Typography and motion:** the main H1 uses `Italian Plate No2 Expanded`, 60 px / weight 600; major section headings are about 42 px / 600; body is 16 px. The capture reported many video elements (49 in the document) and named `fade` CSS animations. The visible work samples occupy a wide, card-based strip. Their high DOM count signals a media-heavy structure but does not establish actual transfer cost or playback policy.

**Accessibility/performance observation:** dark text on the visible light hero is legible in the screenshot; no formal contrast or keyboard test was run. The very large nav and long page raise discoverability and page-weight questions, which should be tested rather than assumed from element counts.

**ZeppBridge transfer:** show one real sample-data task with a clear next action rather than an open-ended AI prompt. Its “full cycle” sequencing can inform an archive journey, but its channel-by-channel menu and marketing-claim density are poor fits for a calm utility.

Copy cue: “Create, launch and scale” is a three-verb arc that compresses a multi-step job.

Sources: [homepage](https://zeely.ai/), [about](https://zeely.ai/about-us/), [pricing](https://zeely.ai/price/), [AI ad generator](https://zeely.ai/ai-ad-generator/).

### HeyGen

**Observed, rendered:** a white canvas with a thin colored outline around the pill-shaped header, a cyan announcement strip and bright accent shapes frames the headline “AI videos starring you, made in minutes.” The first CTA is “Get started for free”; a Google signup action is adjacent. Directly below, rounded portrait-video cards show outcomes across content categories. Lower sections move from avatar realism and a prompt-to-video workflow to translation, tool types, verification/trust, news, community, customer proof, FAQs and a final CTA. The header separates Platform, Use cases, Developers, Resources, Enterprise, Research and Pricing, with demo/sign-in actions distinct. Avatar V, Video Agent, AI Studio and translation each link into dedicated deeper pages; a Trust and Safety destination gives the trust section a separate place to expand.

**Typography and motion:** the H1 computes as `ABC Solar Display` with `TT Norms Pro` fallback, 60 px / weight 400; major headings are about 56 px / 700 and body is `TT Norms Pro`, 16 px. Fourteen video elements were present, including the visually prominent sample-avatar cards. No named CSS animations appeared in the first 20 sampled computed nodes; movement may come from video and other mechanisms outside that sample.

**Accessibility/performance observation:** the first viewport includes two adjacent signup paths, so action hierarchy is less singular than the headline. The trust section and FAQ help answer “how it works / can I use this?” questions, but the public claims were not independently verified. No keyboard, contrast or Web Vitals audit was performed.

**ZeppBridge transfer:** include a trust/data-handling section close to the explanation of how the app works, and answer concrete setup questions before the footer. Replace avatar-proof visuals with real import, archive and export screens; don’t borrow signup pressure or unverified social proof.

Copy cue: “Built on verification, grounded in trust” is a clear trust-section label, though the underlying claims require their own substantiation.

Sources: [homepage](https://www.heygen.com/), [AI video generator](https://www.heygen.com/tool/ai-video-generator), [Trust and Safety](https://www.heygen.com/trust-and-safety), [pricing](https://www.heygen.com/pricing).

### Jumpspeak

**Observed, rendered:** a dark charcoal hero with a restrained teal glow, a two-line centered promise about learning by speaking, three sample conversation-video cards starting below the fold, and one high-contrast “Try 100 Days” button. A small line states the refund/guarantee offer. The header contains only the logo and “Start Speaking”; no menu competes with the first action. The page continues as an argument for speaking from day one, then explains method, example contexts and product benefits, with trust/proof and FAQ content below. “For Teams” and support/privacy/terms are separate destinations; much of the introductory story remains on the homepage.

**Typography and motion:** the H1 uses Outfit at 96 px / weight 500 and body text at 14 px. The page combines cyan-highlighted words, white text and a small waveform. Four video elements were found, and `hero-wave-entry` plus several `jw*` animation names were present in the sampled CSS. This is evidence of a timed hero entrance/wave treatment; reduced-motion behavior was not tested.

**Accessibility/performance observation:** the single header action makes the first choice obvious. Fine 14 px body text and bright cyan on dark should be checked at smaller widths and for contrast; no such test was run. The prominent video examples contribute motion, so a pause/reduced-motion check would be valuable.

**ZeppBridge transfer:** strongest example here is focus: a short promise, a single primary path and then proof/demo. Adapt the restraint to “open a sample archive” or “download for your platform,” with the product itself as evidence. Avoid the long guarantee-led sales treatment.

Copy cue: “by actually speaking it” differentiates the method through a concrete action.

Sources: [homepage](https://www.jumpspeak.com/), [For Teams](https://www.jumpspeak.com/business), [support](https://help.jumpspeak.com/).

### Runway

**Observed, rendered:** the current homepage positions the company as building “Real-World Intelligence,” not just as a single video-generation tool. A black cinematic image panel holds the promise, a compact explanation and “Try Runway for free” CTA. A muted partner-logo row follows, then the page opens out into product and research material. The header groups Creative, Dev, Robotics, Research, Resources, Enterprise and Pricing, with sales, login and “Try Runway.” These map to distinct product, API/docs, robotics, research, enterprise and billing destinations; `Creative` links to the product suite, and research articles are individually addressable.

**Typography and motion:** the visible title computes in `abcNormal`, 40 px / weight 400; body is the same custom family at 16 px. The opening hero appears as a still image in this capture; zero `<video>` elements and no named animations in the sampled nodes were detected. No claim is made about motion elsewhere on the site.

**Accessibility/performance observation:** white text sits over a dark hero image and the CTA is visually distinct. The partner logos are presented as a proof strip; their presence is observed, not an endorsement or independently checked claim. No keyboard, contrast or performance audit was run.

**ZeppBridge transfer:** the category split can help keep “app / documentation / integrations / about” distinct if the product expands. For a focused archive utility, the company-level Real-World Intelligence framing and wide category menu are too broad; keep the homepage anchored in one user outcome.

Copy cue: “understand, simulate and act in the world” is a compact three-part definition of a broad research ambition.

Sources: [homepage](https://runway.com/), [product](https://runway.com/product), [research](https://runway.com/research), [developer docs](https://docs.dev.runwayml.com/), [use cases](https://runway.com/use-cases).

### Kling

**Observed, rendered:** a full-bleed cinematic hero video shows a piano on a ship in rough seas, with “All-New Kling 4.0,” the short line “You call the shots,” a prompt-like example and “Create Now.” A small mute control is visible on the lower-right edge. The top nav groups Creative Studio, API, Resources, Features, About Us and Download, plus language and Try Now. As the visitor scrolls, the cinematic hero gives way to large video examples, a carousel-like gallery and focused video/image-generation features; feature routes, API pricing/docs, user guides and release notes are separate. This gives the homepage a visual showcase role, while feature/detail pages carry tool and developer explanations.

**Typography and motion:** body/default text computes as PingFang SC with Chinese-capable sans-serif fallbacks at 14 px. The visually dominant hero title is an italic display treatment; the semantic H1 is a small 14 px “Kling AI Video and Image Generator” label, so its computed style does not represent the visual hero heading. Thirty-four video elements and a `hero-fade-in` animation name appeared; the hero was actively playing in the screenshot and offered a mute button. Exact animation timing and keyboard operability were not tested.

**Accessibility/performance observation:** a visible mute control is a useful signpost for media control, but its keyboard focus and whether playback can be paused were not checked. Full-bleed video makes the experience vivid and potentially heavy; no transfer-size or Core Web Vitals measurement was made.

**ZeppBridge transfer:** demonstrate the real archive immediately with a short, user-controlled sample interaction; keep media silent and optional. Avoid substituting a cinematic spectacle for a clear explanation of personal data ownership and the desktop task.

Copy cue: “You call the shots” puts creative control in the user’s hands.

Sources: [homepage](https://kling.ai/), [AI video generator](https://kling.ai/feature/ai-video-generator), [user guide](https://kling.ai/quickstart), [API docs](https://kling.ai/document-api/quickStart/productIntroduction/overview).

### Topaz Labs

**Observed, rendered:** a black page begins with a blue announcement ribbon, a compact centered product nav, and a large product statement: “The standard in image and video upscaling.” A horizontal row names concrete jobs—upscale, sharpen, denoise, add detail, restore and stabilize—above a large before/after image. The nav separates Topaz Studio, Web Apps, Desktop Apps, Enterprise and Plans and Pricing; support, documentation, community, news, downloads and cloud credits appear in the desktop-app group. Web tools and desktop apps have distinct destinations. Official text describes web enhancement tools alongside desktop apps using local and cloud workflows, which is a useful product distinction for a desktop-first utility.

**Typography and motion:** the CSS/DOM contained several headings in `area-normal-edit`/`area-normal`, but the browser snapshot also attached an unrelated support/consent widget H1 (“Need product and account support?”), so I do not treat it as the visual hero font measurement. The visible hero title is a large clean sans-serif, but its exact family/weight/size remain unverified. Eleven video elements appeared on the page; no named animations were found in the sampled nodes. The consent panel occupied much of the lower initial viewport and obscured content until an action, which was not taken.

**Accessibility/performance observation:** the screenshot shows an explicit “OK” consent action and a details path. The overlay materially reduces access to the content beneath in the first view. No keyboard/contrast audit was made. Product separation is visible, but local versus cloud execution specifics were not fully checked in the rendered homepage.

**ZeppBridge transfer:** useful reference for naming desktop versus web destinations and then showing a before/after or sample outcome. ZeppBridge should explain its actual local data flow and keep privacy details directly accessible; do not mimic a consent wall or paid-credit ladder.

Copy cue: “Unlimited local rendering” (from the official product plan copy) distinguishes where work happens with only three words.

Sources: [homepage](https://www.topazlabs.com/), [Topaz Studio](https://www.topazlabs.com/studio), [Topaz Web video](https://www.topazlabs.com/web/video), [downloads](https://www.topazlabs.com/downloads/), [official docs](https://docs.topazlabs.com/).

### InVideo

**Observed, rendered:** this current home page describes an “agentic video editor for serious creatives.” The first viewport is dark with a fine grid, a very large centered serif title, a short supporting line and “Start Creating”; small colored cursor/name markers and an editor preview suggest collaboration. Product, Models, Enterprise, Pricing, Resources and Community sit in the top nav. Below the hero are workflow/use-case examples, creation tools and model catalogs. Dedicated routes divide AI video/image/audio tools, individual model pages, pricing, enterprise and agent connections. The homepage is a high-level workflow pitch and product directory; specific tools/models have their own pages.

**Typography and motion:** title uses Lora, 80 px / weight 400; body uses Inter, 16 px. Four video elements were in the document, and sampled styles included `v2-sec-hero-wave` and `v2-cursor-float`; the colored cursor/name markers moved in a way consistent with a collaboration motif. This is sampled motion only, not an interaction or reduced-motion audit.

**Accessibility/performance observation:** a clear central CTA is separated from the secondary “connect agent” route. The dark, low-contrast grid is subtle in the capture, while body copy uses gray on black; verify actual contrast in a production audit. No page weight, keyboard or responsive test was run.

**ZeppBridge transfer:** a real mini-app or interactive archive preview can prove the core job better than abstract copy. Keep helper copy readable and orient the preview around sample data; avoid implying that an automated agent is necessary to complete a basic task.

Copy cue: “Do what you love while … handle the rest” makes the automation boundary legible in everyday language.

Sources: [homepage](https://invideo.io/), [AI video generator](https://invideo.io/make/ai-video-generator/), [remote agents](https://invideo.io/remote-agents/), [pricing](https://invideo.io/pricing/).

### Topview

**Observed, rendered:** a dark, high-density product homepage leads with a banner carousel, then a prompt composer under “Create Any Video, Just Tell Your Agent.” The composer exposes modes (Video Agent, Drama Studio, AI Video, AI Image), model selection and example-skill chips. Cards beneath advertise models, time-limited offers and plugin availability. The header groups Use Cases, AI Tools, Resources, Models, MCP/Skill, Plugin, API and Pricing. Further down, the page distinguishes Canvas, Drama Studio, Board and 3D Shot Composer, then lists team asset-sharing and marketing/film workflows. These are connected to specific product routes, while use-case pages and model catalogs remain discoverable in their own areas.

**Typography and motion:** the main H1 computes as Outfit, 36 px / weight 700; later section headings grow to about 48–52 px / 700. Body controls use a system sans-serif fallback at 16 px. The document contained 94 video elements, with banner examples and a visible prompt mockup; no named animation was found in the first 20 sampled nodes. This is an unusually media-heavy DOM and long page, but asset count alone is not a performance result.

**Accessibility/performance observation:** multiple pricing and generation routes are visible very early, increasing the number of choices before a newcomer understands the product. The main prompt area is visually prominent; its example modes and controls can communicate affordances without prose. No keyboard, contrast, reduced-motion or Web Vitals audit was performed.

**ZeppBridge transfer:** show a real interactive sample only if it opens directly and doesn’t ask for an account; it can explain a data archive better than an abstract hero. Keep one or two primary paths, and move connections, export formats and technical docs into a compact organized menu. Reject the promo/model-price density.

Copy cue: “Create Any Video, Just Tell Your Agent” is an action-oriented prompt, but the AI/agent framing is not relevant to ZeppBridge’s core promise.

Sources: [homepage](https://www.topview.ai/), [AI video agent guide](https://www.topview.ai/guides/ai-video), [Canvas](https://www.topview.ai/canvas), [API](https://www.topview.ai/openapi), [pricing](https://www.topview.ai/pricing).

### Gamma

**Observed, blocked:** the browser displayed a Cloudflare verification screen (HTTP 403), and Jina Reader reported a challenge. The official search result identifies Gamma as a presentation maker and website builder, and the official product route names presentations, websites and more. That textual identity context is not evidence about the current page layout.

**Typography, layout and motion:** unknown. PPMori appeared on the challenge screen’s CSS, but that is challenge UI and must not be attributed to Gamma’s landing page. No reliable navigation, hero, CTA, page hierarchy, motion or accessibility observations were possible.

**ZeppBridge transfer:** no visual transfer recommendation can be made from this access attempt. The presentation/website product taxonomy is only a product-positioning note, not a UX reference.

Copy cue: the official result’s “Presentations, Websites, and More” (search-index text) is an example of compact product-category framing, not a current live-page observation.

Sources: [official homepage](https://gamma.app/), [official presentations product page](https://gamma.app/products/presentations).

### Z.ai (supplemental)

**Observed, rendered product UI:** `z.ai` redirected to `chat.z.ai`. The rendered page is a white, spacious GLM chat workbench rather than a marketing homepage: narrow vertical tool rail, a model selector and login/API links above a central Chinese prompt (“我能为你创造什么？”), a prompt box and a small row of prompt-category examples. Jina’s copy reported temporary unavailability, so the live rendered screenshot is the strongest evidence here. The interface shows a focused way to start an interaction, but it does not expose a conventional marketing-site hierarchy or full navigation groups in this state.

**Typography and motion:** body computes as Geist with system and Chinese-language fallbacks at 16 px; there is no semantic H1 in the captured page. Several CSS names indicated gradient-breathing and placeholder/entrance transitions. The prompt interface and rotating/sample content appear animated; exact duration, pause control and reduced-motion behavior were not tested.

**Accessibility/performance observation:** the central input is visually obvious, and a small tool rail keeps secondary destinations to the side. Labels are largely icon-based in the rail; their accessible names and keyboard operation were not tested. This is a product UI snapshot, not evidence about Z.ai’s corporate site.

**ZeppBridge transfer:** keep the sample-data exploration entry focused and approachable, but make destination labels explicit and describe the archive before asking for input. The AI composer model is not transferable to a non-AI archive product.

Copy cue: “我能为你创造什么？” is a direct question that opens an interaction without a long tutorial.

Sources: [official Z.ai entry](https://z.ai/), [GLM chat route](https://chat.z.ai/), [official GLM-5.3-Flash blog entry](https://z.ai/blog/glm-5.3-flash).

## Cross-site principles for ZeppBridge

1. State one job in plain words, then immediately show how the product performs that job. Descript, Jumpspeak and InVideo all align a short promise with a visible workflow/sample; ZeppBridge can show a sample archive before describing secondary tools.
2. Organize detail pages by user intent. Descript’s workflow and feature routes, Runway’s product/research/API separation and Topaz’s web/desktop grouping each make different destinations legible. A small set of clear tasks (view, import, export, learn) is enough for ZeppBridge.
3. Answer the trust question in the product’s own terms. HeyGen puts verification and safety near its FAQs; Topaz distinguishes product surfaces. For ZeppBridge, explain local storage, optional user-directed AI handoff and missing-sample behavior with the actual data flow, without borrowed customer proof.
4. Use actual interface evidence. A real sample archive, before/after comparison or step-by-step interaction is more credible for a data utility than stock footage, avatars or cinematic generative examples.
5. Treat motion as optional evidence, not the core explanation. Several pages depend heavily on video and animated examples; ZeppBridge’s sample should remain understandable as a still and respect reduced-motion settings.
6. Keep the first decision small. Jumpspeak’s one prominent header action and the compact Descript hero help orientation. Zeely and Topview show how a large tool/channel catalogue can crowd the start.
7. Keep proof and claims narrow. Observed partner logos, social counts and effectiveness statements belong to those companies and were not independently validated here; ZeppBridge should use verifiable details such as supported imports, operating systems and data paths.

## Three strongest references for ZeppBridge

- **Descript — workflow and detail hierarchy.** Its visible Record/Edit/Refine/Share/Multiply sequence can inspire an ordered explanation of import, archive, review and export. Its practical FAQ and separate feature pages suit detailed documentation without putting everything in the hero.
- **Topaz Labs — desktop/web product distinction.** The homepage makes Desktop Apps and Web Apps separate navigational destinations. Borrow the clarity of those destinations while explaining that ZeppBridge’s archive stays local and naming exact platform/download paths.
- **Jumpspeak — first-screen focus.** One short promise, a single dominant action and examples below it keep the first viewport easy to parse. For ZeppBridge, show a sample archive or platform download as the direct next step.

## Patterns to reject

- Long SEO/feature mega-menus organized around every channel, niche or model (Zeely, Topview).
- Full-bleed autoplay media or animated cursor/hero spectacle as the main proof (Kling, HeyGen, InVideo); the archive should remain clear and user-controlled.
- Unverifiable adoption, ROI, performance or customer claims; no customer logos, medical outcomes, or implied endorsement should be added without evidence.
- Forcing account creation before a visitor can understand the product; avoid signup as the sole explanation of value.
- A consent overlay that obscures nearly all first-screen context (observed on Topaz) or a blocked/gated homepage experience (Gamma) as an interaction model.
- Presenting AI or an “agent” as required for basic use. ZeppBridge has no built-in AI and should keep any deliberate handoff optional and explicit.

## Concrete transfer suggestions

- Keep a short nav with named destinations such as **Product**, **Data & privacy**, **Help**, and **Download**; keep OS download choices in one labeled menu rather than scattering them among feature categories.
- Lead with a one-sentence archive promise and one supporting sentence explaining user control. Follow with two clear actions: open the interactive sample and download the app.
- Use the actual interactive sample-data app as the main visual proof. Make clear that it is sample data, and show a still fallback with the same explanation for reduced-motion or blocked-embed conditions.
- Follow the sample with a four-step visual sequence: connect/import → preserve records as received → explore → export/share. Keep missing samples visibly missing in examples.
- Place the data-flow explanation close to the privacy promise, with a small diagram showing local storage and an explicitly initiated optional AI handoff. Explain no mandatory extra account and link to fuller details.
- Use a compact FAQ for supported devices, connection methods, data ownership, backups, missing values and offline behavior. Link each deep answer to documentation instead of expanding the landing-page menu.

Gamma and Z.ai findings are intentionally limited to the access states captured on this date; no visual/page claims were inferred for Gamma, and the Z.ai evidence describes the chat UI rather than its marketing site. No formal accessibility or performance audit was performed for any entry. The pages and marketing claims can change after collection.
