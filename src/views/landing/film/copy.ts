import type { LandingLocale } from '../../../composables/useLandingLocale';

/**
 * 宣传片字幕。中文定稿见 桌面「视频文案&网站\网站与视频计划.md」第四、八节；英文求信达。
 * 其余八种语言在 P5 按信达雅补齐，未补之前回落英文（不回落中文：看不懂中文的人更多）。
 */
export interface Caption { title: string; sub?: string }

const zh = {
  tagline: { title: '腕上所记，尽归于你。' },
  chapterLook: { title: '外观' },
  chapterConnect: { title: '连接' },
  chapterRead: { title: '看懂' },
  chapterAi: { title: '交给 AI' },
  chapterSettings: { title: '设置' },
  glass: { title: '一见，倾心。', sub: 'Liquid Glass，贯穿每一处导航。' },
  morph: { title: '从哪里来，回哪里去。', sub: '卡片展开成页，收起时回到原位。' },
  focus: { title: '一处清晰，万物退后。', sub: '说明、事件、卡片，居中浮起，四周虚化。' },
  poker: { title: '一叠光阴，信手翻阅。', sub: '7 天、1 个月、6 个月，一层层展开。' },
  deck: { title: '专注一张，或随心铺开。' },
  lines: { title: '随手一拨，自有分寸。' },
  night: { title: '一键入夜，覆盖全局。' },
  ash: { title: '弹指之间，换一种语言。', sub: '十种语言。' },
  cloud: { title: '云上有的，桌上都有。', sub: '登录 Zepp 账号，记录同步到这台电脑。' },
  autosync: { title: '你睡你的，它同步它的。', sub: '关、15、30、60 分钟，自动同步。' },
  devices: { title: '每一块表，都认得。', sub: '自动识别；认错了，亲手指认。' },
  local: { title: '健康数据只在你的电脑上。', sub: '从不经过我们的服务器。' },
  metrics: { title: '数十项指标，尽收眼底。' },
  focusAreas: { title: '睡眠还是训练，首页随你排。' },
  hourly: { title: '一日之步，按时细数。' },
  workout: { title: '跑过的路，都有回声。', sub: '和自己以往相近距离的每一次相比。' },
  blank: { title: '绝不编造任何数据。' },
  events: { title: '身有起伏，事出有因。', sub: '记下感冒、发烧、旅行、出差，让 AI 读懂你的生活。' },
  subscription: { title: '复用已有订阅，不多花一分钱。' },
  prompt: { title: '问什么，你说了算。' },
  coach: { title: '一键复制，一键粘回。', sub: '最聪明的教练，就在你手边。' },
  plan: { title: '计划由你，落笔成训。' },
  formats: { title: '四种格式，一次满足。', sub: 'JSON · CSV · GPX · FIT' },
  mcp: { title: '本机 AI，直接来问。', sub: 'MCP 让 Claude Code、Codex 这类本机工具读你的数据；你点头，它还能直接发布训练计划。' },
  display: { title: '公里或英里，12 或 24，大小随心。' },
  backup: { title: '快照在手，进退有据。', sub: '数据库快照，一键生成，随时恢复。' },
  api: { title: '本机 API，只对你开门。', sub: '只绑 127.0.0.1，只读，要令牌。' },
  free: { title: '免费，开源，处处可用。', sub: 'Windows · macOS · Linux · 十种语言' },
  tryIt: { title: 'zeppbridge.com' },
  pile: { title: '叠成一叠，收进箱里。' },
  planIntro: { title: '训练计划，交给 AI。' },
  tell: { title: '身体怎样，直接告诉它。', sub: '附上睡眠和训练记录，一起发过去。' },
  summarize: { title: 'AI 读完记录，排好一周。' },
  toWatch: { title: '电脑上定稿，手表上开练。' },
} satisfies Record<string, Caption>;

export type CaptionKey = keyof typeof zh;

const en: Record<CaptionKey, Caption> = {
  tagline: { title: 'Everything your wrist remembers. Yours to keep.' },
  chapterLook: { title: 'Look' },
  chapterConnect: { title: 'Connect' },
  chapterRead: { title: 'Understand' },
  chapterAi: { title: 'Send to AI' },
  chapterSettings: { title: 'Settings' },
  glass: { title: 'Fluid at first sight.', sub: 'Liquid Glass, in every bar you touch.' },
  morph: { title: 'Back to where it began.', sub: 'A card opens into a page, and folds back to its place.' },
  focus: { title: 'One thing in focus. The rest steps back.', sub: 'Notes, events and cards rise to the centre.' },
  poker: { title: 'Shuffle through time.', sub: 'Seven days, a month, six months, layer by layer.' },
  deck: { title: 'Focus on one. Or spread them all.' },
  lines: { title: 'Toss it around. It always comes back.' },
  night: { title: 'One tap. Night falls everywhere.' },
  ash: { title: 'One snap. Another language.', sub: 'Ten languages.' },
  cloud: { title: "If it's in the cloud, it's on your desk.", sub: 'Sign in with Zepp and your records sync to this computer.' },
  autosync: { title: 'You sleep. It syncs.', sub: 'Off, 15, 30 or 60 minutes.' },
  devices: { title: 'Every watch you wear, recognised.', sub: 'Detected for you, and yours to correct.' },
  local: { title: 'Your health data stays on your computer.', sub: 'It never passes through our servers.' },
  metrics: { title: 'Every metric, at a glance.' },
  focusAreas: { title: 'Sleep or training. Your overview, your order.' },
  hourly: { title: 'Every hour, accounted for.' },
  workout: { title: 'Every run echoes the last.', sub: 'Compared with your own runs of a similar distance.' },
  blank: { title: 'Nothing is ever made up.' },
  events: { title: 'Every dip has a reason.', sub: 'Note a cold, a fever, a trip, so AI reads your life right.' },
  subscription: { title: 'The AI you already pay for. Not a cent more.' },
  prompt: { title: 'Ask it your way.' },
  coach: { title: 'Copy. Paste back.', sub: 'The smartest coach is already at hand.' },
  plan: { title: 'Your plan, your call.' },
  formats: { title: 'Four formats. One click.', sub: 'JSON · CSV · GPX · FIT' },
  mcp: { title: 'Your local AI, straight to the source.', sub: 'Over MCP, local tools like Claude Code and Codex read your data. With your say-so, they publish the plan too.' },
  display: { title: 'Kilometres or miles. 12 or 24 hours. Any size you like.' },
  backup: { title: 'Snapshots to step back to.', sub: 'Save the database in one click. Restore whenever you need.' },
  api: { title: 'A local API that answers only you.', sub: 'Bound to 127.0.0.1, read-only, token required.' },
  free: { title: 'Free. Open source. Everywhere.', sub: 'Windows · macOS · Linux · Ten languages' },
  tryIt: { title: 'zeppbridge.com' },
  pile: { title: 'Stack them. Toss them in.' },
  planIntro: { title: 'Your training plan, by AI.' },
  tell: { title: 'Tell it how you feel.', sub: 'Your sleep and training records go along.' },
  summarize: { title: 'AI reads your records and plans the week.' },
  toWatch: { title: 'Finalise on your computer. Train on your watch.' },
};

export interface FilmScript { prompt: string; answer: string; watchName: string; watchMeta: string }
/** 其余八种语言各一个文件 `film/locales/<语言>.ts`（default 导出这个结构），放进去就生效。 */
export interface FilmPack { captions: Record<CaptionKey, Caption>; script: FilmScript }

const PACKS: Partial<Record<LandingLocale, FilmPack>> = {};
for (const [path, module] of Object.entries(import.meta.glob<{ default: FilmPack }>('./locales/*.ts', { eager: true }))) {
  PACKS[path.slice('./locales/'.length, -'.ts'.length) as LandingLocale] = module.default;
}

/**
 * 字幕和 iframe 里的界面必须是同一种语言：某语言的字幕文件还没到，这一语言的访客整片看英文版，
 * 不然就是英文字幕配法语界面。
 */
export type FilmLocale = LandingLocale;
export const filmLocale = (locale: LandingLocale): FilmLocale => (locale === 'zh' || locale === 'en' || PACKS[locale] ? locale : 'en');

export const filmCaption = (locale: FilmLocale, key: CaptionKey): Caption =>
  (locale === 'zh' ? zh : locale === 'en' ? en : PACKS[locale]?.captions ?? en)[key];

/**
 * 短片「训练计划」那段的台词：访客把身体状况发给 AI（附上记录），AI 读完排出一周。
 * 演示对话是合成的示例（界面上标着「示例对话」），排出的一周就是演示数据里那份计划（demo/plan.ts）：
 * 今天休息、明天轻松跑（接回时改成 40 分钟）、恢复骑行、节奏跑、间歇、长距离。
 */
const SCRIPT: Record<'zh' | 'en', FilmScript> = {
  zh: {
    prompt: '最近左膝有点酸，这两晚也没睡好。帮我排下周的训练，强度低一点。',
    answer: '看了你附上的记录：这两晚睡得偏短，静息心率比平时略高；膝盖不舒服，先减量，不做快跑。\n\n下周这样排：今天休息；明天 40 分钟轻松跑起步，第二天恢复骑行；节奏跑、间歇和长距离隔天穿插，每次都留出热身和放松。计划已整理好，接回 ZeppBridge 就能逐日查看、发到手表。',
    watchName: '轻松跑',
    watchMeta: '40 分钟',
  },
  en: {
    prompt: 'My left knee has been a bit sore and I slept badly the last two nights. Plan next week for me, and go easy.',
    answer: "From the records you attached: the last two nights were short and your resting heart rate is a little above usual. With the sore knee, we'll cut the volume and skip the sprints.\n\nNext week: rest today, a 40-minute easy run tomorrow, then a recovery ride. Tempo, intervals and the long run are spaced out, each with a warm-up and cool-down. The plan is ready. Bring it back into ZeppBridge to review each day and send it to your watch.",
    watchName: 'Easy run',
    watchMeta: '40 min',
  },
};

export const filmScript = (locale: FilmLocale): FilmScript =>
  locale === 'zh' || locale === 'en' ? SCRIPT[locale] : PACKS[locale]?.script ?? SCRIPT.en;
