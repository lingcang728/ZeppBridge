# Landing-page research — batch 01

Collected 2026-10-07 (Asia/Taipei). Scope: 10 primary entries plus Arena and Base44 supplemental. I used official homepages and official product pages, Jina Reader for text, and a fresh headless Chromium 155.0.8059.39 session at 1440×1000 for rendered evidence. Cached Playwright Chromium 1208 was explicitly selected because the installed Playwright package expected a different cached revision. No accounts were used.

Raw evidence (screenshots, DOM summaries, and Jina text snapshots) is in `%TEMP%\zeppbridge-landing-batch-01` (absolute path: `C:\Users\15pro\AppData\Local\Temp\zeppbridge-landing-batch-01`). `*-top.png` is the first viewport; `*-full.png` is the scrolled full-page capture. Each `.json` records page status, title, computed heading/font data when a heading rendered, links, sections, and initial animation objects. The `.md` snapshots are Jina text captures. Browser gates and snapshots are dated, temporary evidence, not claims of universal site behavior.

## Coverage

| Entry | Official URL | Coverage | Evidence note |
|---|---|---|---|
| OpenAI | [openai.com](https://openai.com/) | text-only | Jina snapshot returned the current homepage content; Chromium returned a Cloudflare “please wait” gate (403). |
| Anthropic | [anthropic.com](https://www.anthropic.com/) | rendered | HTTP 200; screenshot, computed heading CSS, nav and section structure. |
| Canva | [canva.com](https://www.canva.com/) | text-only | Jina returned the site content and mega-menu taxonomy; Chromium returned a Cloudflare verification page (403). Typography/layout/motion remain unknown. |
| Superhuman | [superhuman.com](https://superhuman.com/) | rendered | HTTP 200; screenshot, nav, font-family and animation snapshot. |
| Higgsfield | [higgsfield.ai](https://higgsfield.ai/) | rendered | HTTP 200; screenshot and DOM. The text-reader route returned 403. Identity checked against [Higgsfield help](https://higgsfield.ai/creator-hub/help-center/getting-started) and its [official API workspace](https://open.higgsfield.ai/explore). |
| Replit | [replit.com](https://replit.com/) | text-only | Jina returned current homepage text/nav; Chromium was blocked by Cloudflare (403). |
| Suno | [suno.com](https://suno.com/) | rendered | HTTP 200; screenshot, computed H1 CSS, section and animation snapshot. Official help page identifies suno.com as its web entry. |
| Lovable | [lovable.dev](https://lovable.dev/) | text-only | Jina returned current homepage text/nav; Chromium returned Cloudflare verification (403). Official OpenAI directory also links to lovable.dev. |
| Perplexity | [perplexity.ai](https://www.perplexity.ai/) | blocked | Chromium and Jina both returned 403/gate content. The official search-indexed [Perplexity Hub](https://www.perplexity.ai/hub) result is usable only for broad product taxonomy and positioning, not rendered design. |
| ElevenLabs | [elevenlabs.io](https://elevenlabs.io/) | rendered | HTTP 200; screenshot, computed H1 CSS and navigation. A language suggestion overlay appeared automatically. |
| Arena (supplemental) | [arena.ai](https://arena.ai/) | rendered | HTTP 200, but the visible page remained a loading/skeleton state throughout the short capture. Jina exposed only the top navigation and starter prompts. Official [Arena announcement](https://newblog.lmarena.ai/new-lmarena/) identifies lmarena.ai as its official product site; current page is arena.ai. |
| Base44 (supplemental) | [base44.com](https://base44.com/) | rendered | HTTP 200; screenshot, computed H1 CSS, nav and section structure. The official [OpenAI plugin listing](https://openai.com/business/plugins/base44/) also names base44.com. |

## Per-site observations

### OpenAI

**Observed from official text only:** the corporate homepage title is “OpenAI | Research & Deployment.” The primary nav groups Research, Products, Business, Developers, Company and the OpenAI Foundation. A “Try ChatGPT” link sits alongside login; the extracted homepage body then foregrounds “What can I help with?” / “Message ChatGPT” and a rotating-style list of example prompts across writing, coding, travel, learning and image creation. Lower page material groups recent news, stories, research, business and “Get started with ChatGPT.” The footer fans into research/model releases, safety, ChatGPT/Codex, API/docs, business solutions and customer stories. This is a broad institutional front door that still offers a direct product action.

**Typography, layout, motion:** unknown. The live browser showed only a Cloudflare gate, so no typography or visual layout claims are made. The source text does contain a skip-to-main link, but keyboard behavior was not tested.

**Transfer:** preserve a direct product entry above the institutional story. OpenAI’s broad company/product taxonomy is too large for ZeppBridge’s single-product landing page.

Sources: [official homepage](https://openai.com/), [ChatGPT home-page help article](https://help.openai.com/en/articles/9125172-the-chatgpt-home-page), [ChatGPT FAQ](https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq).

### Anthropic

**Observed, rendered:** a warm ivory canvas with an unusually clear split hero: “AI research and products that put safety at the frontier” on the left, a short public-benefit explanation on the right, then a wide cinematic media panel. The first viewport gives the proposition and company context before a prominent image/video. Below it, three release cards make recent model updates concrete, then a mission statement and curated references lead into a four-column footer. The top nav is Research, Policy, Commitments, Learn and News, with a distinct “Try Claude” action. Footer groups Products, Solutions, Resources and Company; the Claude product surface is a separate destination linked from the homepage.

**Typography/layout:** Chromium computed the hero as “Anthropic Sans”, 700 weight, about 61px with 67px line-height; body copy also uses “Anthropic Serif”. The hero’s large two-column spacing and broad media block establish a measured, editorial rhythm. The footer becomes dense but stays grouped by responsibility.

**Motion/accessibility/performance:** no Web Animations API entries were active at the capture snapshot; a large media panel is present, but its playback behavior was not verified. The DOM includes “Skip to main content” and “Skip to footer” links and a main landmark. I did not run keyboard, contrast, reduced-motion or Web Vitals audits.

**Transfer:** the side-by-side promise and explanation is a strong fit for explaining “local archive” and “you control your data” in one screen. Follow the content hierarchy and restrained tone, not the cinematic media scale.

Sources: [homepage](https://www.anthropic.com/), [Claude product overview](https://claude.com/product/overview), [Anthropic company](https://www.anthropic.com/company).

### Canva

**Observed from official text only:** the official page opens with “What will you design today?” and a “Start designing” / “Start designing for free” action. Its navigation is a very deep, task-oriented mega-menu: Digital design, Print design, Images and photos, Videos and audio, Product, Canva AI, Plans, Business, Solutions, Features, Resources, Education and Help. The homepage text spotlights AI-powered social posts, videos and presentations, then modular tool promotion such as Magic Layers, Magic Eraser and background removal. Feature-specific landing pages sit below these menu categories; the homepage acts as a high-level launchpad and discovery surface.

**Typography, layout, motion:** unknown. The rendered capture was only a Cloudflare verification screen (403); Jina text supports copy and IA observations but not visual or motion claims. No accessibility or performance audit was run.

**Transfer:** organize any future “ways to explore” by the user’s job (view, export, backup, analyze) rather than internal implementation modules. Canva’s menu size and cross-sell breadth would overcomplicate ZeppBridge.

Sources: [homepage](https://www.canva.com/), [Canva AI](https://www.canva.com/canva-ai/), [features](https://www.canva.com/features/).

### Superhuman

**Observed, rendered:** the landing page’s first screen is a suite-level pitch: “Bring AI inside every app and tab with Superhuman Go.” “Try Go” is the primary button; “Learn more” is secondary. A pale lavender banner points users who came for Mail to a dedicated Mail page. The dark black-to-teal hero includes a compact product selector and use-case rows, followed by proof logos, then a section for agents, a testimonial, Mail productivity, Docs collaboration and enterprise. The top nav is extensive but responsibilities are grouped: Products (Go, Agents, Mail, Calendar, Docs, Databases, Store), Solutions (team/industry/use-case), AI, Resources, Pricing and Love/customer stories, plus sales and sign-in. Dedicated product pages carry the deeper feature detail.

**Typography/layout:** the selected page uses the custom “Super Sans VF” family in body/control text. No H1 node was present in this DOM snapshot, so hero weight and scale are left unknown. The product rows use clear selected-state highlighting and short one-line benefit descriptions.

**Motion/accessibility/performance:** the DOM exposed a 10-second progress animation and 500ms carousel dissolve transitions. This confirms timed carousel activity, not its accessibility or usability. No formal keyboard, contrast or performance measurements were made.

**Transfer:** the redirect strip and one-line product summaries help visitors orient when a broad suite has multiple entry points. For ZeppBridge, use this only to clarify distinct “try sample / download / docs” choices; its multi-category menu and partner-logo proof block are not needed.

Sources: [homepage](https://superhuman.com/), [Mail detail](https://superhuman.com/mail), [Go detail](https://superhuman.com/go), [suite pricing](https://superhuman.com/plans).

### Higgsfield

**Observed, rendered:** this is a visually dense, dark creative marketplace. A neon-lime offer ribbon leads into a dense horizontal nav of Explore, Image, Video, Audio, MCP, API, AI Influencer, ChatGPT Plugin, Genjutsu, Ads Studio, Effects and pricing/login actions. The first screen is already a visual catalogue: large media cards, tool tiles and promotional creative panels. The primary action appears repeatedly inside offer cards (“Sign up and get your discount”), while product discovery is the dominant navigation responsibility. Further down, the page exposes workflow and feature groups, with separate tool pages and API docs for deeper tasks.

**Typography/layout:** no H1 was rendered in the DOM snapshot. Computed families across visible text included Inter and Space Grotesk; the screenshot’s compact all-caps card labels use a display treatment, but exact heading weight/scale was not verified. The density and repeated high-saturation offers are observed, not a recommendation.

**Motion/accessibility/performance:** the DOM reported active “pulse”, text shimmer and floating-dot animations; these are evidence of animated components, not a full motion audit. Images and promotional media dominate the first screen. I did not measure transfer size, keyboard access or reduced-motion behavior.

**Transfer:** consider one purposeful gallery of actual ZeppBridge screens or sample archive data after the value proposition. Reject the persistent promo ribbon, constantly changing offers and densely packed tool taxonomy.

Sources: [official homepage](https://higgsfield.ai/), [official help center](https://higgsfield.ai/creator-hub/help-center/getting-started), [official model explorer](https://open.higgsfield.ai/explore), [API quick start](https://open.higgsfield.ai/quick-start).

### Replit

**Observed from official text only:** the homepage positions Replit around the prompt “What will you build?” and “Turn ideas into apps in minutes — no coding needed”; examples span websites, mobile apps, design, slides, animation, data visualization, 3D games, documents and spreadsheets. Text snapshot nav is grouped into Products (Create: Design, Apps & Websites, Slides; Platform: Agents, Databases, Integrations, Security), Solutions (by role and by use case), Pricing/Enterprise, then Resources (Docs, Community, Support, customer stories, gallery, blog and newsroom). The homepage hands off to distinct product and role/use-case pages.

**Typography, layout, motion:** unknown. Browser access stopped at a Cloudflare block page (403); the Jina snapshot supports text and navigation only. The official page copy includes “your first prompt is free,” but I did not verify the live interaction or whether signup is required.

**Transfer:** prompt starters can make an unfamiliar desktop utility feel concrete. For ZeppBridge, make examples refer to exploring a sample archive or finding an available measurement; do not turn the homepage into a blank AI prompt.

Sources: [homepage](https://replit.com/), [Agent page](https://replit.com/products/agent), [gallery](https://replit.com/gallery), [docs](https://docs.replit.com/).

### Suno

**Observed, rendered:** the hero is an actual composition entry point rather than a static product illustration. A dynamically changing song prompt (“Make a house song about quitting your job”) sits above a concise explanation, then a wide translucent composer with “Chat to make music”, an Advanced control and a clear Create button. Product, Resources, Pricing and Careers are the short top-level nav; login and “Join Suno for free” sit at right. The background is full-bleed, dark and warm, with dimmed example tracks angled at the sides. Below, the hierarchy moves from quality/use examples to tool families (Studio, Voices, stem separation, remix, custom models), free creation and inspiration, then FAQs. Deeper features link to dedicated pages.

**Typography/layout:** H1 computed as “Neue Montreal”, 500 weight, 72px with 72px line-height. It is centered and large; supporting copy is short and directly describes the composer action.

**Motion/accessibility/performance:** a caret is visible at the end of the example prompt in the hero screenshot; CSS/DOM also showed a 30-second marquee and a 3-second flash animation. The capture did not establish whether the prompt text itself changes automatically. I did not test reduced-motion settings, keyboard operation or the composer’s actual generation flow. Large background imagery and example-track cards are present; performance was not benchmarked.

**Transfer:** this is the strongest interaction reference: lead with ZeppBridge’s real sample-data explorer and frame it with one explicit promise and one download action. Keep movement optional or restrained; don’t imitate the animated phrase if it makes the product’s fixed health-data contract feel less precise.

Sources: [homepage](https://suno.com/), [Suno help: web sign-in](https://help.suno.com/en/articles/2408065), [Studio](https://suno.com/studio-welcome), [Voices](https://suno.com/voices).

### Lovable

**Observed from official text only:** the page opens “Build something Lovable” with a supporting statement about bringing a product, internal tool or company to life. A prompt-to-product explanation follows: plain-language description, live refinement and deployment. The sequence then covers hosting, app stack connections, payments, security and cross-device access, followed by customer proof, production examples and usage claims. The navigation and footer separate Enterprise, Pricing, Security, role-specific landing pages (Founders, Product Managers, Designers, Marketers), Company and product resources. Homepage explains the path; narrower pages address each role and the enterprise proposition.

**Typography, layout, motion:** unknown. Chromium displayed Cloudflare’s verification gate (403). The text snapshot cannot establish whether the page actually previews generation, or what type, layout or animations appear.

**Transfer:** the explicit sequence “describe → refine → ship” is a useful pattern for explaining ZeppBridge’s connection/import → inspect → export flow. Avoid assuming that a polished promise substitutes for showing the actual screen and supported device/data boundary.

Sources: [homepage](https://lovable.dev/), [AI app builder](https://lovable.dev/ai-app-builder), [security](https://lovable.dev/security), [role pages](https://lovable.dev/founders).

### Perplexity

**Observed only in an official indexed result:** the current official Hub describes a suite around Answer Engine, Computer, Comet browser and API Platform, with entry actions for answers, building with Computer, trying Comet and building with the API. A high-level “from first question to finished work” story organizes Research, Analyze, Build and Automate. That makes product-family responsibilities legible at the copy level; the individual surfaces are split across app, browser and developer destinations.

**Typography, layout, motion, accessibility:** unknown. Both direct Chromium and Jina returned 403/gate content. Search-indexed copy is insufficient evidence for page layout, nav grouping, typography, motion or interaction. No performance or accessibility observations can be made.

**Transfer:** borrow the explicit verb labels (for ZeppBridge: Connect, Explore, Export) as section language. Do not present AI as a default requirement; ZeppBridge’s AI handoff remains an optional deliberate export path.

Sources: [homepage](https://www.perplexity.ai/), [official Hub](https://www.perplexity.ai/hub).

### ElevenLabs

**Observed, rendered:** a quiet white first screen with an optional model-announcement strip, compact nav (Products, Solutions, Customers, Resources, Enterprise, Pricing) and separate Log in / Sign up actions. The headline “Bringing technology to life” sits left of a short audience/product explanation; “Sign up” and “Contact sales” make self-service and enterprise paths distinct. Directly underneath, a segmented product chooser exposes ElevenCreative, ElevenAgents and ElevenAPI over a visual carousel, before the page descends into tool-specific sections for speech, music, sound effects, voices and image/video, then agent deployment, analytics and testing. Specialty feature pages are reached from these categories; the homepage functions as both category switcher and proof-rich overview.

**Typography/layout:** the H1 computed as “Waldenburg”, 300 weight, 48px with 52px line-height; control text uses Inter. The headline is deliberately light and comparatively small; the adjacent summary and segmented controls share the load.

**Motion/accessibility/performance:** a multi-item visual carousel is visible, with a central play control. A language suggestion panel appeared over the lower-right portion of the first screen in this region; I did not interact with it or assess keyboard handling. Hero media is present; no network-size/Web Vitals audit was run. I did not verify reduced-motion behavior.

**Transfer:** the three clear pathways (everyday users, creative tools, developers/API) could translate into clear paths for ZeppBridge’s desktop app, CLI/MCP and API without mixing them into one feature list. Avoid importing the enterprise-first social proof or the unrelated AI voice imagery.

Sources: [homepage](https://elevenlabs.io/), [AI voice generator](https://elevenlabs.io/text-to-speech), [Creative](https://elevenlabs.io/creative), [Agents](https://elevenlabs.io/agents), [API](https://elevenlabs.io/developers).

### Arena — supplemental

**Observed, partly rendered:** current `arena.ai` loads an app-like shell with a left navigation rail and “New Chat”, “Leaderboard” and “Search” links in Jina’s extraction. The center prompt presents “Experience the frontier” and starter cards for creating a landing page, dashboard, game, design-to-code conversion, full-stack app and storefront, followed by Battle/Auto model modes and a notice that inputs are processed by third-party AI and can be inaccurate. In Chromium, the content remained placeholder skeleton cards with pulse animations; visual design and product interaction were therefore not available for evaluation. Treat the navigation and copy as text-only evidence.

**Typography/motion/accessibility/performance:** the live DOM has a serif H1 style family martinaPlantijn at 48px and 300 weight, but the screenshot is an incomplete skeleton. The shell body uses Basel Grotesk. Several 2-second pulse animations were active on skeleton blocks. No proper interaction or accessibility/performance audit was possible.

**Transfer:** if ZeppBridge uses an external AI export, provide a plain-language boundary notice next to that action. The model battle/create prompt surface itself does not fit a local-first health archive.

Sources: [Arena homepage](https://arena.ai/), [Leaderboard](https://arena.ai/leaderboard), [official product announcement](https://newblog.lmarena.ai/new-lmarena/).

### Base44 — supplemental

**Observed, rendered:** nav groups Product, Use Cases, Resources, Security, Pricing, Enterprise and Superagents, with a strong “Start building” action. The hero “Every builder needs a base” describes apps, websites, products and agents, then offers a large live prompt box and category toggles (Apps, Websites, Games, Tools). A dotted-paper background gives way to a horizontal strip of real example products. Subsequent sections sequence full-stack features, app/site/agent use cases, templates, marketing tools, plans and FAQs. The dedicated AI App Builder page expands the feature and steps, so homepage functions as an interactive overview and routing surface.

**Typography/layout:** H1 computed as Dazzed, 600 weight, about 94px with 98px line-height. Supporting copy and prompt box sit on a centered column; example tiles span most of the screen width, giving a clear “try a task, then see examples” hierarchy.

**Motion/accessibility/performance:** the first screen showed example cards and a real prompt entry point; no animation was confirmed by the DOM snapshot. I did not test prompt interaction, keyboard access, reduced motion, contrast or Web Vitals. The example strip and full-width imagery make the page media-heavy; no transfer-size claim is made.

**Transfer:** the clearest supplemental reference for how a sample product can be presented in context. A real ZeppBridge sample archive preview should be immediately labeled as synthetic/sample data and remain separate from the user’s actual archive. The oversized headline and full-bleed gallery are too loud for ZeppBridge’s calm health-data positioning.

Sources: [homepage](https://base44.com/), [AI App Builder](https://base44.com/ai-app-builder), [features](https://base44.com/features), [security](https://base44.com/security).

## Cross-site principles

1. **Put one user outcome before the catalog.** Anthropic’s two-part proposition, Suno’s first-task composer, ElevenLabs’ paired audience summary and product tabs all orient visitors before asking them to compare details.
2. **Use an actual product surface as proof.** Suno, Base44 and Higgsfield let a visitor see a working or near-working surface early. For ZeppBridge, the sample-data explorer can prove what an archive feels like more directly than a dashboard collage or feature count.
3. **Make the next action explicit and honest.** “Try Claude,” “Create,” “Try Go,” “Start designing” and “Sign up” state the action. ZeppBridge should distinguish sample exploration, local download, connection setup and optional AI handoff.
4. **Group deeper information by visitor question.** Anthropic’s Products/Solutions/Resources/Company and Superhuman’s product vs. audience/use-case groups make the role of detail pages clearer. A single small product can stop at sections and a restrained footer instead of mirroring suite menus.
5. **Show the path from product to proof.** News/release notes, workflow steps, feature detail, pricing or docs can sit below the main promise. For ZeppBridge, explain connection methods and data ownership before asking users to choose a device route.
6. **Treat motion as support for a task.** Suno’s example prompt/caret and Arena’s loading pulses are visible; Superhuman’s carousel has timed transitions; Higgsfield animates offer labels and tiles. Motion needs a clear benefit and reduced-motion/keyboard checks before adoption.
7. **Trust details need to match the product contract.** Anthropic’s mission/policy links and Arena’s third-party processing notice are specific. ZeppBridge should say local archive, optional deliberate AI handoff and missing samples remain missing; avoid broad “secure/accurate” claims without plain explanations.

## Strongest references for ZeppBridge

- **Anthropic** for quiet editorial spacing, a concise promise paired with trust context, and a thoughtful release/source hierarchy.
- **Suno** for using a real interactive product entry as the homepage centerpiece and giving it one clear action.
- **ElevenLabs** for cleanly separating distinct product pathways beneath a single umbrella. Base44 is an additional visual reference for showing a live sample product, but its oversized style is not a tone match.

## Reject and adapt

- Reject mega-menus, multi-product suite catalogues, and cross-sell-heavy page structures from Canva, Superhuman, Replit or Higgsfield; ZeppBridge is one desktop product with companion technical interfaces.
- Reject unsubstantiated adoption/time-saved/medical outcome claims, customer logos, fake testimonials, medical implications or implied endorsements. Several benchmark sites use those devices; they do not transfer without independently supported evidence.
- Reject a default AI prompt as the front door. ZeppBridge has no built-in AI and should not imply that users must send health data to a model.
- Adapt the product-first pattern into a clearly labeled synthetic sample-data preview, followed by five calm scroll beats: value, live sample, data/connection trust, supported platforms, download/docs. Keep real archive access, missingness semantics, and optional export behavior explicit.
- Use short user-language section labels such as “Explore a sample,” “Keep your archive,” “Connect your device,” and “Export when you choose.” Give each section a direct purpose and route technical detail to docs rather than creating a broad marketing taxonomy.

## Evidence limits

Only Anthropic, Superhuman, Higgsfield, Suno, ElevenLabs and Base44 produced useful rendered-page evidence; Arena rendered only a skeleton/loading shell. OpenAI, Canva, Replit and Lovable were text-only because Chromium was challenged; Perplexity was blocked for both browser and text retrieval. For those sites, typography, exact layout, interaction and motion are explicitly unknown. Jina content and search-index excerpts may lag or omit dynamic material. No site received a full accessibility audit, keyboard/assistive-technology review, reduced-motion test, performance benchmark or logged-in product-flow inspection.
