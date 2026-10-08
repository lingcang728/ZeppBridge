# Landing-page research — Batch 08

**Collected:** 2026-10-07 (Asia/Taipei) · **Scope:** 10 assigned products plus supplemental Venice\
**Method:** official product/company pages and publisher app-store pages; Jina Reader for official-page text; isolated headless Playwright using the existing installed Chrome at 1440×1000. The Playwright package was present, but its configured Chromium build was missing, so the existing Chrome executable was reused. No browser or package was installed. Initial and approximately 75%-scroll screenshots, rendered HTML, and DOM observations are retained in `C:\Users\15pro\AppData\Local\Temp\zeppbridge-landing-batch-08`. Screenshots are evidence of a browser viewport, not a complete accessibility, mobile, or performance audit. Nav hover and keyboard paths were not tested. “Motion” below means only media or active CSS animation observed in the captured page state; it does not imply a full interaction test.

## Coverage

| Entry | Official source(s) | Coverage | Evidence files (under the evidence directory above) |
|---|---|---|---|
| VN | [VN](https://www.vlognow.me/) | Rendered; English and Chinese locale variants observed | `vn.html`, `render-html-results.json`, `vn-fresh-top.png`, `vn-fresh-scroll.png` |
| Remini | [Remini](https://remini.ai/) | Rendered | `remini.html`, `rendered-evidence.json`, `remini-fresh-top.png`, `remini-fresh-scroll.png` |
| Baidu AI Search | [a16z mobile entry](https://a16z.com/100-gen-ai-apps-7/); [linked Baidu App Store page](https://apps.apple.com/cn/app/%E7%99%BE%E5%BA%A6-ai%E6%99%BA%E8%83%BD%E6%90%9C%E7%B4%A2/id382201985); [Google Play Baidu app](https://play.google.com/store/apps/details?id=com.baidu.searchbox) | a16z’s mobile list links directly to the exact official iOS listing; that CN storefront rendered successfully. Google Play is a broader Baidu App cross-reference, not assumed to be the same “AI Search” SKU. | `baidu-appstore-cn.html`, `baidu-appstore-cn.json`, `baidu-appstore-cn-top.png`, `baidu-appstore-cn-scroll.png`, `baidu-appstore.md`, `baidu-playstore.html`, `baidu-playstore.md` |
| Meitu | [Meitu company site](https://www.meitu.com/en/); [Meitu app listing](https://play.google.com/store/apps/details?id=com.mt.mtxx.mtxx) | Both rendered; company page and app listing treated as separate surfaces | `meitu.html`, `meitu-store.html`, `product-followup.json`, `meitu-fresh-top.png`, `meitu-store-top.png`, `meitu-store-scroll.png` |
| Facemoji | [Facemoji site](https://www.facemojikeyboard.com/); [Facemoji app listing](https://play.google.com/store/apps/details?id=com.simejikeyboard) | Both rendered | `facemoji-web.html`, `facemoji-store.html`, `product-followup.json`, `facemoji-web-top.png`, `facemoji-web-scroll.png`, `facemoji-store-top.png` |
| Wink | [Wink](https://wink.ai/) | Rendered | `wink.html`, `rendered-evidence.json`, `wink-fresh-top.png`, `wink-fresh-scroll.png` |
| Hypic | [Hypic](https://hypic.capcut.com/) | Rendered | `hypic.html`, `rendered-evidence.json`, `hypic-fresh-top.png`, `hypic-fresh-scroll.png` |
| Adobe Express | [Adobe Express](https://www.adobe.com/express/) | Official page text-only through Jina; headless browser returned HTTP 403 “Access Denied”; layout, typography, and motion unverified | `adobe-express.md`, `adobe-express.html`, `adobe-express-fresh-top.png` |
| Microsoft Bing | [Bing](https://www.bing.com/) | Rendered; localized Chinese first view observed in the initial session; content varies by locale/session | `bing.html`, `rendered-evidence.json`, `bing-fresh-top.png`, `bing-fresh-scroll.png` |
| YouCut | [YouCut listing](https://play.google.com/store/apps/details?id=com.camerasideas.trimmer) | Rendered official Google Play listing; an initially tried package ID was a 404 and was discarded | `youcut.html`, `product-followup.json`, `youcut-store-top.png`, `youcut-store-scroll.png` |
| Venice (supplemental) | [Venice](https://venice.ai/en) | Rendered | `venice.html`, `rendered-evidence.json`, `venice-fresh-top.png`, `venice-fresh-scroll.png` |

`rendered-evidence.json` contains the first rendered pass, including measured heading styles, heading/link lists, media counts, and sampled active CSS animation names. `render-html-results.json` records the corrected official app listing URLs and HTML pass. `product-followup.json` records the measured styles and structure for Meitu, Facemoji, YouCut, and Facemoji’s official marketing site. `baidu-consumer.json` records the Google Play cross-reference and an attempted US App Store redirect; `baidu-appstore-cn.json` records the exact chart-linked CN App Store page, which rendered successfully. Matching HTML files are saved alongside the images. Jina text snapshots include `baidu-playstore.md` and `baidu-appstore.md` alongside the product pages listed below.

## Per-site observations

### 1. VN

**Observation.** The official homepage presents VN as a creator tool rather than an abstract AI product. The first screen pairs a short promise with desktop, tablet, and phone editor imagery, then puts download and tutorial actions directly underneath. In the Chinese locale the headline is “快速、专业、自由创作”; the English page uses “Edit Like a Pro. Create Without Limits.” The Chinese hero’s computed heading is Libre Baskerville/Lato, 52px, weight 700, 62.4px line height. The overall surface is light, with generous white space and a pale-blue next section. A compact top nav groups Product, Features, Blog, Help, language, and Download. The feature links are organized in the page markup as Video, Text, Audio, and AI tool groups; blog/tutorial material and feature articles sit beside the download path. Scroll sections move from a feature catalog to templates, creator quotes, and another download prompt. The page advertises counts and ratings, which are treated here only as vendor-published copy, not verified facts. An infinite CSS animation was active on review-strip elements at capture time (about 118–122 seconds per iteration); no full motion/scroll-trigger audit was performed.

**Inference for ZeppBridge.** The strongest transferable part is the concrete multi-device product view above the fold: it tells visitors what the software is before asking for a download. Retain the one-promise/one-primary-action balance, while avoiding creator metrics, review claims, and a tool-catalog mega-menu.

### 2. Remini

**Observation.** Remini opens with a dark near-black field and a burgundy glow, large centered promise, brief supporting sentence, and a single “Try Remini” CTA. Its product demo—a before/after portrait comparison—begins immediately below the hero, so the core transformation is visible without reading a long feature list. The measured heading uses EuclidCircularB with system sans fallbacks, 80px/500, 100px line height, and −3.2px letter spacing. The top nav separates Enhance (with named tools), AI Photos, Support, and Try Remini. Long-form sections continue through generative photos, business possibilities, more before/after examples, and user quotes; individual enhancer categories link to their own detail pages. A cookie consent panel covered part of the captured demo. Placeholder shimmer and consent-fade CSS animations were active; the before/after control was not dragged or otherwise tested.

**Inference for ZeppBridge.** Showing an authentic sample result can explain a data product more efficiently than another benefits paragraph. Any sample data must be labeled as sample data, and the demo should communicate the actual archive and export experience rather than imply medical analysis.

### 3. Baidu AI Search (consumer iOS app)

**Observation.** The a16z mobile ranking links “Baidu AI Search” directly to Apple’s official listing for `百度-AI智能搜索` (App Store ID 382201985), confirming the chart-to-product identity. The link opens the China storefront. Its rendered first screen uses the App Store’s two-column frame: category/search rail at left; at right, a wide blue-to-gray app header with icon, exact Chinese app name, one-line scope, and free/in-app-purchase/device metadata. A second row gives review/rating, age, ranking, developer, language, and size, followed by four large app screenshots. Those supplied screens show the Baidu content feed, Wenxin assistant, AI search, and video experiences. The listing description groups smart search, current information, Wenxin assistant/deep search, image/video generation, short video, voice recognition, and novels/short dramas. This is the App Store page, not a live capture of the app itself. Heading typography is not reported as product typography; the measured surface belongs to Apple’s store UI. The official Google Play `com.baidu.searchbox` listing was also rendered as a broader Baidu App cross-reference, but its English “Baidu App” description alone does not prove it is the same ranked SKU. An earlier US App Store URL redirected to Today; using the exact chart-linked CN URL fixed the regional mismatch. The separate Baidu Cloud “百度AI搜索” API page is an unrelated enterprise namesake and is excluded.

**Inference for ZeppBridge.** The chart identity is now resolved to the exact consumer iOS app. The listing demonstrates how a mobile product’s platform-specific store page pairs its name and install context with publisher-provided screenshots, but it does not provide web navigation, app interaction, or desktop product evidence. No product-website typography or motion claims are inferred from this store page.

### 4. Meitu

**Observation.** Meitu’s company homepage is an umbrella corporate page, not the mobile app screen. It opens on a pink-to-violet gradient with the centered headline “Uniting Art and Technology,” a short company description, and a product roster that points to Meitu, BeautyCam, Wink, Designkit, and Kaipai. The headline measured PingFang SC with sans-serif fallbacks at 60px/500 and 90px line height. Navigation is corporate: Overview, Products, Talents, Sustainability, Investor, and Media. The app’s current official Google Play listing was checked separately: it is a standard store layout with a large app identity, install action, feature screenshot carousel, “About this app,” data safety, ratings, updates, and support. The listing copy emphasizes an all-in-one photo/video editor and specific effects; publisher-provided screenshots show those tools. The Play listing’s heading measured Google Sans Display/Roboto at 64px/500. No active CSS animation was captured on either page.

**Inference for ZeppBridge.** A company page can use expressive art direction while keeping product links readable. For this project, the archive app itself should stay the subject; the Meitu corporate page’s product portfolio breadth should not become a reason to grow ZeppBridge’s navigation.

### 5. Facemoji

**Observation.** Facemoji has a proper official marketing page in addition to its official store listing. The website first screen uses a white two-column layout: a large left-aligned “Join Facemoji / And start texting / Creatively today!” headline and feature bullets; a bright yellow phone/keyboard illustration fills the right column. App Store and Google Play buttons are direct, dark pill-shaped actions, and a small capability strip follows. The heading measured Poppins-Bold, 52px/700, with 62px line height. The nav assigns destinations by task: Home, Font, Text Art, Emoji, Social Generator, Creator, and Contact us. The page continues into interactive-looking font and Genmoji examples before an app download section; the linked quick tools are more specific than the single marketing hero. The official Play listing confirms publisher identity and app scope, but its Store presentation is not treated as the app’s internal UI. No active CSS animation was sampled on the marketing page.

**Inference for ZeppBridge.** The strong reusable detail is showing an actual product-shaped object beside concrete benefits and matching platform actions. The playful emoji density, bright yellow palette, and social-virality language do not fit ZeppBridge’s calm data-ownership tone.

### 6. Wink

**Observation.** Wink’s first fold is a cinematic, darkened full-width face/video backdrop with a left-aligned brand mark, bold promise, short explanation, and two labeled actions: “Start Free” and “Download.” The computed heading is Montserrat, 60px/800, 64px line height. Navigation groups Online Tools, Features, Blog, Pricing, Start Free, and Download; tool groups expose separate image/video utilities. The homepage then moves through a “Choose Your Perfect Fix” set of contexts (portrait, scenery, concert, game), portrait retouch controls, art effects, more creative tools, and FAQs. The page also contains a hero video element and active bounce/fade-in CSS animations. A cookie banner sits across the bottom of the captured first view. No playback, hover, or reduced-motion behavior was tested.

**Inference for ZeppBridge.** Wink demonstrates how one umbrella promise can lead into concrete use-case examples and then specialist feature pages. Its full-bleed video, aggressive weight, and paired CTAs would add visual noise and cost without clarifying ZeppBridge’s data workflow.

### 7. Hypic

**Observation.** Hypic’s official page is a sparse white product landing page with a small brand/language/download header, large black headline, one-sentence explanation, download action, and a broad collage of portrait imagery. The observed heading is “Natural Edits / Effortless Vibes”; its family is Hypic with SF Pro/Arial fallbacks at 60px/500, 66px line height. The visible action is “Download now.” The page continues as a single tall product explainer, grouping portrait retouch, adjust/enhance, AI effects, templates, and filters, then linking to app stores. The only nav text detected was legal links; the visible header acts more like a small download bar than a multi-section site nav. Several short entrance animations and one long-running CSS animation were active at capture time (one sampled duration was 42.3 seconds); their visual intent was not inferred from generated CSS names. No video element was found.

**Inference for ZeppBridge.** A focused product page can keep the navigation small when the offer is one app and the page itself explains its parts. Hypic’s portrait-first collage and beauty promise are product-specific, and its long image-heavy scroll should not be copied as structure by default.

### 8. Adobe Express

**Observation.** Adobe’s official Express URL was readable through Jina Reader, but headless Chrome received an HTTP 403 “Access Denied” response. Therefore the visible layout, nav, hero type, and animation are **unknown** for this capture. The source text describes a quick, all-in-one creation app and groups content for Teams, Enterprise, and Students, then lists features, cross-device creation, collaboration/brand controls, plan pricing, and app-store links. The page’s exact first-screen order cannot be confirmed from the text extraction and is not described as a visual fact.

**Inference for ZeppBridge.** The audience split and plan comparison show a way to route distinct needs into detailed sections, but ZeppBridge has no corresponding enterprise/student tiers. Do not import those audience categories or price-plan structure.

### 9. Microsoft Bing

**Observation.** The current homepage is a search surface, not a conventional marketing landing page. The captured localized view uses a full-viewport woodland image, Microsoft/Bing branding, a centered search input, small suggestion/action chips, and a top row for Copilot, Images, Video, Maps, and News. Language/account/Rewards and wallpaper attribution/legal links sit around the edges. The search field is the visual focal point; no populated H1 was found, so no hero typeface/scale is claimed. The page’s content and labels vary by locale/session (the browser’s initial context showed Chinese navigation). A video element was present, but no active CSS animation was observed and no claim is made about its playback. No search was submitted.

**Inference for ZeppBridge.** Bing shows the value of one unmistakable central action and quiet surrounding navigation. Its ambient photographic background is not a suitable substitute for a real data preview in this product.

### 10. YouCut

**Observation.** There is no separate YouCut marketing page established by this collection; the official Google Play listing is the product surface used. The corrected listing is `com.camerasideas.trimmer` and identifies YouCut - Video Editor & Maker with publisher InShot Video Editor. An earlier attempted package ID returned 404 and is excluded from findings. The rendered Store view places app name, publisher, rating/download metadata, install action, and a horizontal screen-capture carousel above “About this app,” followed by safety, ratings, updates, and app-support sections. Store screenshots show a mobile editing timeline, templates, cuts/splits, transitions, and effects, but these are publisher-supplied app screenshots rather than direct interaction testing. The heading measured Google Sans Display/Roboto at 56px/500, 64px line height. No active CSS animation was sampled. The listing itself contains additional store metadata, so this is not evidence of YouCut’s own page navigation or accessibility.

**Inference for ZeppBridge.** The listing gets the download action and platform screenshots quickly in view. Use the principle of showing authentic interface evidence, while keeping ZeppBridge’s own website responsible for explaining local storage, supported connections, and missing-sample semantics.

### Supplemental: Venice

**Observation.** Venice opens with a near-black ocean video background and a small, centered prompt interface: “Ask anything,” a text field, and task shortcuts for learning, image generation, video creation, and a surprise action. A sign-up action remains in the top corner. Although the visible first view is sparse, the navigation and page content group About, Features, token products, pricing, API/docs, FAQs, Privacy, Blog, Media, download, and status. The page progresses to model/provider groupings, use cases, pricing, API, and a multi-level privacy explanation. The centered headline uses Canela, 36px/400, 43.2px line height. A background video is present; sampled CSS animations include fade/blur, bounce, gradient, pulse, and audio-wave effects. The “private” statements are the company’s own claims and were not independently audited here.

**Inference for ZeppBridge.** Venice’s product-entry point and explicit privacy destination make it easy to understand where to begin and where to inspect data handling. ZeppBridge can borrow that clarity while stating its own local-first data flow precisely; its page should not imitate AI prompts, dark-video atmosphere, or Venice’s privacy claims.

## Cross-site principles and ZeppBridge transfer

### Principles supported by the observed pages

1. **Lead with the product’s actual job.** VN shows the editor; Remini shows a before/after; Bing shows the search box; Venice shows the prompt. A product preview is more informative than a generic “AI-powered” claim.
2. **Make the first action match the destination.** Download actions appear on VN, Facemoji, and Hypic; browser tools offer “Try” or “Start Free”; store pages present “Install.” Label the route instead of making one CTA guess at every visitor’s intent.
3. **Group a broad feature set into a few useful categories.** VN’s video/text/audio/AI grouping, Wink’s online tools/features, and Hypic’s editing families reduce the first choice to recognizable task types. These examples are useful only if the product genuinely has that breadth.
4. **Pair claims with visible evidence.** Remini pairs its promise with a before/after demo, while app listings put supplied screens beside the feature description. Keep examples representative and identify sample data clearly.
5. **Separate the company map from the product map.** Meitu’s corporate navigation serves company, product portfolio, investor, and talent needs; app-store support/safety lives on the store surface. ZeppBridge should keep product explanation and download actions at the top level, with help and project/company material secondary.
6. **Use restrained copy beside strong imagery.** Hypic, VN, and Meitu each place short copy beside a large visual. The imagery must represent the real product and should not crowd the statement or action.
7. **Long pages need a clear section sequence.** The stronger product explainers move from promise to concrete tools/examples, then to details or support. Repeated feature grids without a distinct next question add length without improving orientation.
8. **Privacy and motion need separate verification.** Venice and Wink place privacy/consent or cookie material in visible navigation/overlays, but vendor statements and animation samples are not audits. For ZeppBridge, explain the actual local/optional handoff path and independently check keyboard, contrast, reduced motion, and load behavior.

### Three strongest references for ZeppBridge

1. **VN — [vlognow.me](https://www.vlognow.me/):** relevant because its real editor is visible immediately across device sizes, alongside an uncomplicated download/tutorial choice. Transfer the product-preview idea, not the vendor’s volume claims, creator tone, or feature-menu breadth.
2. **Remini — [remini.ai](https://remini.ai/):** relevant because the before/after product example makes the advertised transformation tangible immediately. Transfer the authentic-preview principle to labeled sample records and exports, not the enhancement promise, dark mood, or social-proof claims.
3. **Venice — [venice.ai/en](https://venice.ai/en):** relevant for a focused entry point paired with a distinct privacy-information destination. Transfer privacy navigation clarity, not AI prompt UI, video atmosphere, or its vendor-specific privacy claims.

### Patterns to reject for ZeppBridge

- Generic AI-first slogans, or adding AI product features the app does not have.
- Unsupported usage counts, performance guarantees, user ratings, testimonials, or medical outcomes.
- Full-screen autoplay video and decoration that competes with the actual data preview.
- Dense mega-menus whose size reflects a competitor’s feature catalog rather than users’ tasks.
- Store screenshots presented as proof of the current desktop app or its live behavior.
- Treating data gaps as zeroes or implied estimates; missing samples must remain visibly missing.
- Turning optional AI handoff into a default or implying a required extra account.

### Concrete transfer suggestions

- Keep the homepage’s lead statement focused on a **local archive for the owner’s Zepp/Amazfit history**, with a direct download action and a secondary path to explore the sample-data preview.
- Put the real interactive sample-data app or a carefully labeled still of it near the first explanation; make clear that the displayed records are sample data and not the visitor’s health data.
- Order the story around the user journey: connect/import → browse and export → how data stays on the device → supported platforms/downloads. Use short sections that answer one question each.
- Give privacy its own visible destination and diagram the actual optional handoff boundary. State that missing samples stay missing; never suggest that charts fill gaps with zeros or estimates.
- Keep the primary nav to product, how it works, privacy, and downloads; route deeper help/locales from clear secondary controls. Maintain visible keyboard focus, text contrast, reduced-motion behavior, and a non-video fallback in separate implementation verification.

## Evidence limitations

- This report records a single desktop viewport and one scroll position per rendered page; it does not cover responsive breakpoints, the complete page, hover states, keyboard interactions, screen readers, or network performance.
- Adobe’s official page text was available, but the rendered browser received an edge-denial page; all Adobe layout/type/motion descriptions are deliberately omitted.
- Meitu, Facemoji, and YouCut app listings are publisher/store representations. Their supplied screen images are not hands-on app verification. Facemoji’s official website was rendered separately; Meitu’s company homepage is an umbrella corporate site.
- The a16z mobile entry links directly to the official Apple “百度-AI智能搜索” App Store page, confirming the consumer iOS SKU. Its CN storefront rendered successfully; an attempted US storefront URL first redirected to Today. The Google Play Baidu App is retained only as a broader cross-reference, and Baidu Cloud’s similarly named enterprise API page was excluded.
- Vendor statements (including page metrics, ratings, privacy, and performance claims) are transcribed only as page copy where relevant and are not independently verified.
- No formal WCAG, privacy, or performance audit was performed. The report distinguishes sampled browser observations from transfer recommendations and does not treat rendered CSS names alone as proof of a user-facing motion effect.
