# Supplement 05 — Activity and personal health-data sites

**Research date:** 2026-10-07. **Coverage:** ten new brands from the reserved activity/personal-health-data candidate set. This is a current-site inspection, not a claim that these are all design leaders.

## Method and limits

I used isolated, headless Chromium contexts on Windows at 1440×1000 and 390×844, then revisited official detail pages. The installed Playwright package expected Chromium 1234 while the existing cache held Chromium 1208, so I launched that cached executable directly; no browser or package was installed. I recorded screenshots, extracted page text and computed font styles, tested two keyboard focus stops per site, and emulated `prefers-reduced-motion`. Screenshots and machine-readable measurements are in `C:\Users\15pro\AppData\Local\Temp\zeppbridge-supplement-05\` (`measurements.json`, `details.json`, `keyboard.json`, `sitecheck.py`, and the named PNGs cited below). Screenshots were opened for visual review.

Locale was not uniform: Strava, Gyroscope, and Bevel selected Chinese in at least one session; I used the English Strava feature URL and an English Exist page when available. These are observations of this environment, not conclusions about the sites’ locale policy. I did not sign in, start subscriptions, send a support message, or submit personal data. One initial Strava generic interaction clicked “Accept All” on the cookie panel in its isolated scratch context; no account or user profile was involved. Komoot’s “Customize preferences” panel was opened but not saved.

AllTrails returned HTTP 200 at `/` but rendered a Chinese “access temporarily limited” bot-check screen at desktop and mobile. Its `/explore` and `/explore/custom-routes/new` routes returned 403. The extracted page DOM contains the homepage headings, but the screenshots show the access gate; I treat the visible product, scroll, and carousel behavior as blocked. The other nine homepages returned 200. Strava’s `/features` returned 200 and exposed page copy, but its screenshot was mostly blank with the cookie panel and one CTA, so its feature-page visual details remain incomplete. Athlytic’s `/getting-started/` returned 200 with an empty title/body in this browser; its official Support page did render and was used as the detail destination. No text-only or blocked output is treated as visual evidence.

The free Exa MCP search limit was reached after several searches; the documented route to add a private API key was not appropriate here, so I switched to the available web search/open fallback. Jina Reader also failed its TLS handshake once. Official pages, the existing cached browser, and web search were sufficient to finish without adding credentials. Design recognition is only attached to the specific work/category named by the source; first-party user counts, ratings, and award badges are not independent validation.

## Coverage

| Brand | Official entry | Result and inspected destination | Interaction evidence / inclusion type |
|---|---|---|---|
| [Strava](https://www.strava.com/) | Main site; [`/features`](https://www.strava.com/features?hl=en-US) | Home 200; features 200, but feature screenshot visually incomplete | “Activities” hover exposed sport groups; 2 keyboard stops. Recognized site/campaign and activity-data benchmark. |
| [komoot](https://www.komoot.com/) | Main site; [`/features`](https://www.komoot.com/features) | Home and features 200; a regional route discovery destination showed a loading state | Cookie “Customize preferences” revealed controls; feature route explains discover/plan/navigate/share. Recognized by its own redesign account, not an independent award. |
| [AllTrails](https://www.alltrails.com/) | Main site; [`/explore`](https://www.alltrails.com/explore) | Home bot-check; detail 403 | Keyboard skip link/focus visible; mobile menu and product views blocked. Editorially recognized, but no usable design screenshot in this pass. |
| [TrainingPeaks](https://www.trainingpeaks.com/) | Main site; [`Coach Match`](https://www.trainingpeaks.com/coach-match/) | Both 200 | “For Athletes” opened a mega-menu; the coach destination explained its matching flow. Performance-training benchmark. |
| [Intervals.icu](https://www.intervals.icu/) | Main site; [`Track Your Progress`](https://www.intervals.icu/features/track/) | Both 200 | “Features” expanded and collapsed; destination broke analytics into named modules. Dense functional benchmark. |
| [Athlytic](https://athlyticapp.com/) | Main site; [`Support`](https://athlyticapp.com/support/) | Both 200; getting-started route body empty | Support knowledge base and categories inspectable; no in-page state control was exposed in this pass. Editorially recognized as an app, not as a website design. |
| [Gentler Streak](https://gentlerstories.com/gentlerstreak) | Product landing page | 200; page itself carries the product story | Scroll through Activity Path and rest-focused sections; no dropdown or stateful control found. App design recognition is strong. |
| [Bevel](https://www.bevel.health/zh) | Main site; [`About`](https://www.bevel.health/zh/about-us) | Both 200 | Product-to-about navigation inspected. Polished visual reference; inclusion as data-hub category is an editorial judgment, not a verified design award. |
| [Exist](https://exist.io/) | Main site; [`data syncing catalogue`](https://exist.io/apps-data-syncing/) | Both 200 | Selecting Fitbit changed the import-coverage statement; clicking it again restored the unknown state. Quantified-self/data-source benchmark. |
| [Gyroscope](https://gyrosco.pe/) | Main site; [`Health app`](https://gyrosco.pe/app/) | Both 200 | Language menu exposed locales; two timed captures showed body-scan sweep and rotating goal choices. High visual relevance, but not an independent design-award reference found here. |

## Detailed observations

### 1. Strava — recognizable activity-data brand; current homepage is a signup front door

The official root rendered at 1440×1000 with a two-photo athletic frame around a narrow white registration column. The Chinese H1 measured **32px/600, Boathouse**; body copy measured **15px/400, 24px line-height**. The short promise is “来自社群的动力” (“motivation from the community”), with Google, Apple, and email registration. The footer is prominent in the first viewport; on the 390px page the measured hero H1 had a zero-sized box after its responsive transition, so I do not infer mobile readability from the DOM metric. The screenshot and DOM are retained as `strava-desktop-top.png` and `strava-mobile-top.png`.

The top-level groups are Activities, Features, Maps, Challenges, Subscription, and Login. Hovering Activities exposed sport categories including running, cycling, and walking. The official `/features?hl=en-US` copy organizes its promise into **Train / Explore / Compete** and links onward to training, routes, and challenges. Its current screenshot was mostly blank except a “Dive into your Subscription” CTA and the cookie panel; copy and route were accessible, not a complete rendered section. The root screenshot/scroll captures are effectively the same signup/footer view, so there was no verified long-scroll story in this session.

Keyboard Tab displayed a 1px native dark focus ring on the brand and the signup link. CSS inspection found `fadeInDown` and a subscription pulse; those animations still appeared in the emulated reduced-motion state. I did not visually verify those CSS animations moving over time. Awwwards’ profile records an **Honorable Mention for Strava**; separately, the 2025 Webby recognition is for the **“Year in Sport” campaign**, not this current landing page. These establish recognition of specific work, not proof that the current localized signup page is a useful ZeppBridge template.

**Transfer:** the compact activity taxonomy and movement-oriented “community” framing can help explain supported activity records. Do not copy the signup-first page, cookie-heavy front door, or a social-network voice for a local archive.

### 2. komoot — route discovery told as a sequence of outdoor jobs

The desktop hero pairs a full-bleed forest/hiker image with the heading “Explore beyond the map.” Computed type is **Nohemi, 72px/500, 90px line-height**; the 390px heading becomes **40px/500**. Satoshi is used for controls/body. The interface is warm off-white, black, and olive with pill-shaped active states. The consent panel was centered over the hero; behind it the site communicates “find,” “plan,” and “navigate” and shows mobile-route screens.

The visible header is a tightly grouped **Routes / Planner / Features / Updates / App / Login or Signup**. A “Routes” navigation destination resolved to a location-based discovery URL for the current region and showed a loading spinner in this session; I closed that isolated page rather than enter an account flow. The official `/features` page rendered with “Find your perfect adventure” and an end-to-end sequence: Discover, Plan, Navigate, Share, Contribute, Record, Explore. This reconnects the homepage’s scenic promise to real jobs rather than broad feature names. The homepage copy proceeds from sport-specific planning to inspiration, turn-by-turn/offline navigation, sharing, then curated collections. The scroll captures show those sections; mobile document width measured 375px at a 390px viewport.

“Customize preferences” opened the consent choices and exposed their analytics, advertising, and preference-management descriptions without saving a selection. The home-page CSS included short 0.2s transitions and a `rotate` animation; no active animation remained in the reduced-motion spot check. The 2025 komoot newsroom describes its own refresh in palette, type, icons, illustration, spacing, contrast, organization, navigation, and more prominent route photos. This is a first-party design rationale, not independent award recognition.

**Transfer:** make the visitor’s job path explicit—connect, inspect, understand, export—and connect each section to a real destination. Keep the sense of a journey while retaining ZeppBridge’s quieter data-ownership tone and avoiding outdoor photography as a borrowed identity.

### 3. AllTrails — relevant route/record structure, but visual inspection blocked

The official root’s DOM exposed “Find your next adventure,” “Record your activities,” and links for creating trips, custom routes, nearby trails, offline maps, live tracking, and trail discovery. Computed DOM styles named AllTrailsAeonik and measured a 72px/500 desktop heading and 48px/500 mobile heading. These values came from a document whose visible screenshot is a bot-check page; they are **not** treated as a verified visible product rendering. The mobile screenshot is the same access-limited state. The attempted Explore and custom-route destinations returned 403, and the Navigation Menu click timed out behind that gate.

Keyboard Tab did reach a visible “Skip to main content” link with a 2px blue outline, followed by the brand link. This is the only actual product-like interaction evidence available from the accessible shell; the carousel’s pause and slide controls appeared in extracted DOM but could not be visually or behaviorally verified.

Designerly named AllTrails its January 2026 website-design award winner and discussed its navigation, mobile responsiveness, typography, palette, and trail-detail consistency. This is a specific independent design-editorial source, though its award is not equivalent to a major industry jury prize. Its article is context, not a substitute for our blocked live inspection.

**Transfer:** the semantic map from overview to conditions/reviews/route details is useful for thinking about summary-to-record navigation. This pass supplies no claim about the current AllTrails site’s actual visual behavior. Revisit in a normal, non-gated environment if it becomes a primary reference.

### 4. TrainingPeaks — dense performance product organized by user role and training task

The homepage begins with a white header above a blue-to-violet training hero. Its H1 is **EncodeSansExpanded-ExtraBold, 72px, CSS weight 400, 81px line-height** (the font face itself supplies the heavy appearance); mobile measures **30px**. Supporting copy distinguishes athletes and coaches. The first scroll changes from a large dark media panel to federation/team tiles; a later viewport introduces PLAN / TRAIN / LIFT modules and device support. The second browser capture showed an actual running video frame where the initial page screenshot had shown a black panel, so first-load media timing matters.

Navigation is split into **For Athletes, For Coaches, Training Plans, Learn, Find a Coach**, then separate Athlete Sign Up, Coach Sign Up, and Log In actions. Clicking **For Athletes** exposed a role-specific mega-menu: features, pricing, plans, articles, quick-start guide, free trial, and help. The official **Coach Match** destination says that a person completes a questionnaire, staff review goals/location, then receive a coach match for a free consultation; I stopped before its questionnaire. This page completes the landing promise, but it introduces a human-service workflow that is not relevant to ZeppBridge.

Two timed screenshots showed changing video frames. CSS also reports looping partner-logo tracks, `u-pulse`, and `slide-down-custom`; these persisted with reduced motion emulated. The separate focus check placed the keyboard on “For Athletes,” but its 1px outline color computed fully transparent with no shadow—an actionable focus-visibility concern in this captured state. The menu returned by closing its isolated page; no account flow was opened.

**Transfer:** role/task separation is useful where ZeppBridge has genuinely different journeys (new connection vs. ongoing analysis). Reject multi-role signup menus, black video placeholders, and an unbounded metric catalog on the landing page.

### 5. Intervals.icu — unusually legible product taxonomy for a technical training archive

The official homepage uses a pale violet/white ground and dark indigo text. H1 “Train Smarter. Together.” is **Roboto, 56px/700** on desktop and **32px/700** on mobile. The intro is 21.6px/400 with 32.4px line-height. The first view presents connectors, the product promise, and four first-party figures (“200,000+,” “300M+,” “2018,” “Free”); these are site claims, not independently checked counts. The header separates **Features, Events, Coaches, Pricing, About, Forum**, plus theme, login, and sign-up actions.

Clicking the **Features** control toggled its expanded state and exposed links grouped into product, community, company, and event dashboards. The inspected [`Track Your Progress`](https://www.intervals.icu/features/track/) detail page groups Fitness Chart, Multisport, Power Curve, Power Rankings, Activity Totals, Wellness, Custom Charts, and Custom Formulas. The scroll capture moves naturally from grouped cards to analysis examples. The official copy describes wellness fields such as sleep, HRV, readiness, glucose, menstrual cycle, stress, mood, and hydration, and notes a user-built chart/formula route. This detailed page helps a technically curious visitor understand why the homepage says “analytics”; it is a functional benchmark rather than a site with independent aesthetic recognition found in this pass.

The site’s dark-mode control and menu structure are visible, though I did not switch theme in the main pass. No active CSS animation remained under reduced motion. The mobile menu button was present, but the scripted second click met a timeout while the close-menu state was visible; I do not count it as a verified open/close loop.

**Transfer:** progressive feature names tied to recognizable records and chart types can reveal depth without a wall of card labels. Put the real demo/source context beside each chart and make missingness a first-class state; do not copy performance scores as implicit health judgments.

### 6. Athlytic — app-first recovery guidance with a strong support destination

The official site opens in near-black with vivid green highlights, a compact Archivo wordmark, and phone/watch imagery. The main tagline is a `div`, not an H1: computed display style is **Archivo, 48px/900, 50.88px line-height**, in the desktop hero. It reads “Know when to push. Know when to recover.” beside a direct Apple App Store button and “Why Athlytic?” link. The homepage’s own awards panel shows MacStories Selects Best Watch App 2025.

The next scroll presents “One number in the morning. One target all day.” as three numbered steps: sleep HRV/resting heart rate to a Recovery score, a personalized exertion zone, then live workout exertion. Another section shows a daily dashboard with recovery/exertion/sleep numbers. The page links data from Apple Health to these summaries, giving the reader a clear source-to-insight narrative. **Support** is the useful official detail path: a searchable FAQ/user-guide description for metric calculation and sync troubleshooting, followed by distinct feature-request, bug-report, subscription-issue, and general-help routes. I did not activate its mail links. “Why Athlytic” resolved to `/getting-started/`, which returned an empty body in this browser, so Support—not that route—is the verified detail page.

MacStories awarded Athlytic **Best Watch App** in its 2025 Selects; the editorial praises how the watch interface makes several metrics available without overwhelming the small display. This is app/product recognition, not a website-design award. The page showed 0.8–1.2s CSS transitions but no active animation after reduced-motion emulation; I did not verify a transition visually. Keyboard focus moves through the brand and “Why Athlytic?” with a 1px native outline.

**Transfer:** a source→summary→interpretation explanation and a useful help destination are good patterns. Keep any health recommendation claims and readiness scores clearly owned by the originating product; ZeppBridge should describe source, date, unit, coverage, and missing values rather than diagnose.

### 7. Gentler Streak — the clearest recognized humane tone in this set

The official product page lays a saturated outdoor-running photograph behind a phone mockup and white type. The H1 is **Inter, 60px/700, 72px line-height**; its major scroll headings are 44px/600. The page calls itself an award-winning tracker, then presents three distinct recognitions: 2022 Apple Watch App of the Year, 2024 Apple Design Award for Social Impact, and 2023 Visuals and Graphics finalist. Apple’s 2024 award listing independently names Gentler Streak the Social Impact winner and describes health data organized around exercise, rest, wellness, and progress relative to the individual’s history.

Scroll sections organize the promise as “Move at your own pace,” “Built for the long game,” and “Streaks that celebrate rest,” then explain Activity Path with daily readiness, a 10-day view, a 30-day view, and a status that can account for an injury, illness, or break. This is a concrete return from product tagline to feature detail. The nav is restrained—Gentler Streak, The Outsiders, Blog, Newsroom—with no dropdown found. I found no homepage stateful control beyond navigation/store links. The product page remained static in the paired time captures; no CSS animation was detected in its measured page elements.

**Transfer:** use self-reference and an even-handed vocabulary (“history,” “trend,” “rest”) instead of ranking a person or implying that every change is good/bad. The award belongs to the app, not its marketing site, and wellness advice should not be transplanted as data fact.

### 8. Bevel — premium multi-source health hub with strong visual polish and overclaim risk

The home route redirected to `/zh` while the content and page title remained English. Its sky-gradient hero centers “Your Connected Health Coach,” measured **Inter/system, 80px/600** desktop and roughly **50px/600** at 390px. Supporting type is 24px/400. A floating pill nav contains Bevel Home, About, Login, and Download app; “Works with” lists Apple Watch, ŌURA, Garmin, Amazfit, and Google Health. The high whitespace, cloud-like gradient, rounded pill navigation, and device imagery make it a polished visual reference; the first scroll uses integrations/social proof before feature groups.

Homepage sections enumerate strain, sleep, recovery, food, health records, Bevel Intelligence, and smaller features. It displays “4.8 / 49.1K ratings” and “over 2.5 million members”; these are first-party on-page claims, not independently verified. The About page (`/zh/about-us`) is a long founder-letter-style mission story and repeats broad longevity/wellness framing, plus first-party privacy claims. I did not treat its health-history narrative or metrics as evidence. The About destination is a real detail page but is not a neutral data-flow explanation.

The measured page contained only short color/transform/opacity transitions and none remained active under reduced motion. No stateful in-page interaction surfaced in the tested controls; keyboard moved cleanly from the brand link to About with visible native focus. The design recognition search did not establish an independent web/app design award for Bevel, so inclusion is our editorial judgment based on its multi-source health-data visual composition.

**Transfer:** the integrations strip and quiet visual pacing can help position ZeppBridge as a reader of existing device archives. Reject the connected-coach, bloodwork, biological-age, longevity, AI, and rating/scale claims; they change the product promise and are not supported by ZeppBridge’s role.

### 9. Exist — the strongest direct example of a transparent self-tracking inventory

Exist’s site has a warm gray top strip, restrained black type, and a white hero built around floating tags, familiar objects, and one phone illustration. The heading “Exist” is **Inter, 38px/200**. The adjoining example sentence is **30px/300** and was observed changing over time from a bedtime/weight pair to a step-count/mood pair. The tag objects also visibly moved between two same-viewport captures; CSS lists 2.7–3.1s infinite float animations. Those animations remained active when reduced motion was emulated, and no pause/reduced-motion control was found in this pass.

The homepage explains a combination of automatic syncing and manual entries, then groups content as “Track everything in one place,” correlations, custom fields, and mood. The official [`What data can you bring to Exist?`](https://exist.io/apps-data-syncing/) page is the strongest inspected destination: service cards for Health Connect, Apple Health, Garmin, Oura, Strava, Fitbit, calendars, and productivity/media sources precede an explicit list of importable metric categories. Selecting Fitbit locally changed “rating unknown” to “rating okay”; clicking it again restored “unknown.” The page does not require me to connect an account to show what the selection changes. It is a reversible, useful catalogue of data coverage rather than an abstract integration logo wall.

The header is just Blog / Sign Up / Login. Feature detail links on the main page include custom tags, mood, syncing, and values. I first hit a static feature image while discovering links, then directly visited the correct syncing destination above. No award-quality claim was established; Exist is included as a directly relevant quantified-self/function benchmark.

**Transfer:** tell people which sources and metric types are actually covered, and distinguish connected records from manual/contextual entries. Favor a static or user-controlled example over looping tag motion; preserve the principle without copying the motion because it persisted under reduced-motion preference.

### 10. Gyroscope — dramatic full-scope health narrative, visually memorable but poor tonal fit

The official site loaded in Chinese at 1440px. A nearly black/navy background frames a blue holographic body model on the left and a concise two-line hero on the right; the section title “记录生活与健康” uses a 15px heading style in the extracted DOM, while the visually prominent hero H2 is **D, 32px/600**. The copy claims a “new operating system for the human body” and invokes real data and AI. The image-heavy page places small anatomy icons beside the scan, then presents a row of user-selected goals. This is a visual-storytelling example, not a fit for ZeppBridge’s restrained, archive-first claim.

Navigation is exceptionally broad: Apps (Health, Places, Food XRAY, Chrome, Desktop/MCP), Membership, Science (tools, benchmarks, trackers, guides, labs), About (mission, history, transparency), and Help, plus a locale menu. The official `/app/` route connects to a “Gyroscope Health” product overview. The language picker expanded a large locale list; I left without switching the interface. A separate same-viewport time pair showed the body-scan sweep moving across the figure and the goals row revealing additional choices. The page’s CSS names these as scan/goal animations; reduced-motion emulation removed all active animations in the captured sample. Keyboard Tab reached Apps with a visible 1px blue ring.

The mobile 390px screenshot included an overlay saying the selected page had not been translated, above English feature content; therefore mobile localization/rendering was only partially inspected. No independent design award was established. Inclusion is our editorial judgment because the product sits in the health-data category and its animated visualization provides a clear contrast case.

**Transfer:** show a real, source-labeled app sample and keep interactive controls optional. Reject whole-body scans, AI-as-lifestyle-system positioning, “live longer,” body-fat/strength goals, and other outcome/medical-adjacent claims. ZeppBridge can explain archive coverage without implying diagnosis or causation.

## Comparison: type, navigation, and motion

| Site | Measured desktop → 390px H1 / family | Top-level navigation / destination structure | Motion and reduced-motion spot check |
|---|---|---|---|
| Strava | 32px/600 → mobile box collapsed; Boathouse | Sport menu, features, maps, challenges, subscription | CSS fade/pulse remains in reduced mode; motion not visually confirmed. |
| komoot | 72px/500 → 40px/500; Nohemi | Routes, planner, features, updates, app | Short transitions/rotate; no active animation found in reduced mode. |
| AllTrails | 72px/500 → 48px/500; Aeonik DOM styles | Explore, saved, shop, app, login; extensive trail/place directory DOM | Carousel shimmer/progress CSS remained in reduced mode; product visibility blocked, so animation not visually checked. |
| TrainingPeaks | 72px, custom ExtraBold face → 30px; CSS weight 400 | Role menu plus plans, learning, coach, role-specific signup | Video frame visibly changes; CSS marquees/pulse remain with reduced motion emulated. |
| Intervals.icu | 56px/700 → 32px/700; Roboto | Features, events, coaches, pricing, about, forum | No active CSS animation found in reduced mode. |
| Athlytic | Main slogan is not an H1 element; Archivo body/brand | Home, Why, widgets, news, blog, support, app | 0.8–1.2s transitions detected; no active animation after reduced mode. |
| Gentler Streak | 60px/700; Inter; mobile 32px/700 | Product, The Outsiders, Blog, Newsroom | No CSS animation detected in measured elements; paired screenshot looked static. |
| Bevel | 80px/600 → ~50px/600; Inter/system | Home, About, Login, Download | 0.15–0.6s transitions; none active after reduced mode. |
| Exist | 38px/200; Inter; mobile 38px | Blog, Sign Up, Login; linked source/mood/manual-data pages | Float loops visibly move tags and rotate sample sentence; remain active under reduced mode. |
| Gyroscope | Hero H2 32px/600; D; mobile mixed translation | Apps, membership, science, about, help, locale | Scan sweep and goal rail visibly move; sampled animations disabled in reduced mode. |

The keyboard pass pressed Tab twice and read the focused element/style; it was not a complete accessibility audit. Useful results: AllTrails exposed a 2px blue skip-link ring even on the gate; Exist used a thick 5px focus outline; Gyroscope showed a blue ring. TrainingPeaks’ role-menu button computed a transparent outline with no shadow on the tested stop. Strava/most others had native visible 1px rings; komoot combines a black outline and blue focus shadow. Do not infer contrast compliance from those spot checks alone.

## Design recognition and strongest references

1. **Gentler Streak** is the most credible tone/content reference in this set: Apple names it the 2024 Design Award Social Impact winner and specifically describes individual-history progress and organized wellness data. The current product page makes those values legible through rest, pace, and consistency sections. Recognition applies to the app, not its website.
2. **Exist** is the best direct information-architecture reference for a multi-source local archive: its service selector shows what the selected connector could import, and the following catalog separates automatic data from manual fields. This is a functional editorial pick; no independent design award was established.
3. **Intervals.icu** is the best dense-data feature-page reference: its individual cards name chart families, multisport scope, wellness, and custom charts/formulas, then link to deeper explanations. Its visual language is more conventional and data-heavy, so take the progressive disclosure, not the palette or score culture.

Recognition context: [Awwwards’ Strava profile](https://www.awwwards.com/sites/strava) labels the Strava site an Honorable Mention; the [2025 Webby win](https://winners.webbyawards.com/2025/apps-software-immersive/app-features/best-visual-design-aesthetic/332962/strava-year-in-sport) is for the separate “Year in Sport” work. [Designerly’s AllTrails award](https://designerly.com/alltrails/) is a specific design-editorial website award. [Apple’s 2024 award notice](https://www.apple.com/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/) names Gentler Streak for Social Impact. [MacStories’ 2025 Selects](https://www.macstories.net/stories/macstories-selects-2025-recognizing-the-best-apps-of-the-year/) names Athlytic Best Watch App; that is product editorial recognition, not a site-design award. Komoot’s [2025 redesign note](https://newsroom.komoot.com/254252-komoot-unveils-modern-design-as-part-of-ambitious-product-roadmap/) is useful first-party rationale but is not independent recognition. For TrainingPeaks, Intervals.icu, Bevel, Exist, and Gyroscope I found no independent design recognition worth claiming in this pass; they remain relevant functional comparisons by editorial choice.

## Principles to transfer to ZeppBridge

- Let the first screen say **what archive this is and what a visitor can do next**. Use a static action pair such as “View the sample” and “Download the public release”; Strava’s signup wall and several competitors’ app-store-only CTA do not fit the product.
- Give each product capability a plain, descriptive destination. Exist’s sync catalog and Intervals.icu’s deep feature pages show how to answer “which sources/metrics?” without inventing data or asking the visitor to register.
- Connect claims to an actual sample view. Keep the real ZeppBridge sample app and identify its edition, synthetic/fixture provenance, and public-download boundary.
- Use personal history and coverage as neutral context. Gentler’s within-person frame is closer than public rankings or a universal recovery score; ZeppBridge should still avoid coaching judgments and say what the stored record shows.
- Separate source trust from source logos. A short connector list is useful only when paired with actual field coverage, source, date, and any unavailable/missing state.
- Use animation only when it explains an actual state. Exist’s looping headline continues under reduced motion; Gyroscope’s sweep visually represents its scan but is too theatrical for the archive. The ZeppBridge plan should honor reduced motion and remain readable without movement.
- Keep technical depth downstream. Role menus and broad category trees on TrainingPeaks/Gyroscope are useful for complex platforms, but ZeppBridge needs a few destinations that map to its five real landing-page sections.

## Patterns to reject and concrete handoff

Reject forced registration, cookie or rating overlays that dominate the first visit, unsupported health outcomes, population/rank comparisons, simulated “your data” dashboards, unverified membership/ratings, and animations that keep running when reduced motion is requested. Do not copy Athlytic/Bevel/Gyroscope readiness or biological-age framing, or the performance-heavy language from TrainingPeaks.

For the planned ZeppBridge landing page: keep the fixed promise and warm-paper/olive/charcoal identity; put the real sample after the heading and primary actions; label the sample edition separately from stable download; expose source and missing-value behavior alongside each feature; make a small set of real anchor links reachable by keyboard on mobile; use a source checklist model like Exist without claiming every connector imports the same fields; and make each deep link land on a page/section with a return path. Preserve `null`/missing values as missing—none of these competitors’ scores or inferred summaries are evidence that a missing Zepp sample can be filled.

## Evidence index

- Home and scroll captures: `C:\Users\15pro\AppData\Local\Temp\zeppbridge-supplement-05\{brand}-desktop-top.png`, `*-scroll-1.png`, `*-scroll-2.png`, `*-mobile-top.png` (brand slug in lowercase; `gentler-streak`, `intervals-icu` use hyphens).
- Detail captures: `strava-features-verified-detail.png`, `komoot-features-verified-detail.png`, `alltrails-explore-verified-detail.png`, `trainingpeaks-detail.png`, `intervals-icu-detail.png`, `athlytic-detail.png`, `bevel-about-verified-detail.png`, `exist-syncing-verified-detail.png`, and `gyroscope-detail.png` in the same directory. Gentler Streak’s product homepage is its product detail.
- Same-viewport motion pairs: `exist-motion-a.png` / `exist-motion-b.png`, `gyroscope-motion-a.png` / `gyroscope-motion-b.png`, `trainingpeaks-motion-a.png` / `trainingpeaks-motion-b.png`, and `gentler-streak-motion-a.png` / `gentler-streak-motion-b.png`.
- Raw values, text, and keyboard/motion measurements: `measurements.json`, `details.json`, and `keyboard.json`.
