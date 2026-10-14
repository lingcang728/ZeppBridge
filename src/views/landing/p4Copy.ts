/**
 * 新版落地页（P4：章节 + 演示片）的文案。每种语言一份，结构必须和 zh 完全一致
 * （id / scene / icon 不翻，只翻字），`__tests__/p4Copy.test.ts` 守着。
 * 其他语言各一个文件 `p4/<语言>.ts`（default 导出 P4Copy），放进去就自动生效。
 * 还没有译文的语言不在 P4_COPY 里，页面对它们回落到旧版布局（MotionStage / RecordBoard / AiStage），
 * 不会出现半页中文；待翻译的条目登记在桌面《翻译.md》。
 */
import type { DesignIconName } from '../../components/DesignIcon.vue';
import type { LandingLocale } from '../../composables/useLandingLocale';

export interface ChapterPoint { id: string; title: string; text: string; scene: string }
export interface FeatureChapterCopy { id: string; name: string; title: string; lead: string; points: ChapterPoint[] }
export interface P4Setting { id: string; title: string; text: string; icon: DesignIconName }
export interface P4NavColumn { label: string; links: { id: string; label: string }[] }
export interface P4Copy {
  chapters: FeatureChapterCopy[];
  /** 「看懂」章节下面那一对睡眠 / 运动演示的标题和说明。 */
  records: { sleep: { title: string; text: string }; workouts: { title: string; text: string } };
  settings: { title: string; lead: string; summaryTitle: string; summaryLead: string; items: P4Setting[] };
  /** 顶栏「产品」下拉的三栏。 */
  nav: P4NavColumn[];
  /** 「问什么，你说了算」演示片里逐字打进输入框的问题：口语、第一人称。 */
  demoPrompt: string;
}

const zh: P4Copy = {
  chapters: [
    { id: 'motion', name: '外观', title: '一见，倾心。', lead: '玻璃做的导航，会形变的卡片，像扑克牌一样翻阅的日子。', points: [
      { id: 'glass', title: '玻璃', text: '按住慢慢拖过导航，再轻点切换。边缘折射，跟着指尖流动。', scene: 'glass' },
      { id: 'morph', title: '形变', text: '卡片展开成页，返回时回到原处。一处清晰，万物退后。', scene: 'morph' },
      { id: 'poker', title: '牌桌', text: '日牌连着翻，整月、整周逐层展开。挑好的，放进收集箱。', scene: 'poker' },
      { id: 'theme', title: '日月', text: '深浅两套主题，一键入夜。', scene: 'theme' },
    ] },
    { id: 'connection', name: '连接', title: '云上的记录，回到桌上。', lead: '连接 Zepp 账号，记录同步到这台电脑。设好频率，之后交给自动同步。', points: [
      { id: 'account', title: '官方授权', text: '在系统浏览器里登录 Zepp，第三方账号也能用。授权状态随时可查。', scene: 'account' },
      { id: 'sync', title: '自动同步', text: '关、15、30、60 分钟。你睡你的，它同步它的。', scene: 'sync' },
      { id: 'devices', title: '认得你的表', text: '自动识别型号；认错了，亲手指认。', scene: 'devices' },
      { id: 'local', title: '留在本机', text: '从 Zepp 同步的健康记录保存在本机，不经过我们的服务器。交给 AI 的内容由你选择。', scene: 'local' },
    ] },
    { id: 'records', name: '看懂', title: '数十项指标，尽收眼底。', lead: '在一页里看清所有趋势，身体状态一目了然。点开指标，继续看完整记录。', points: [
      { id: 'overview', title: '随你排', text: '睡眠还是训练，首页按你的关注重排。上下浏览，再点进详情。', scene: 'overview' },
      { id: 'hourly', title: '一日之步', text: '每小时的步数、距离、热量，按时细数。', scene: 'hourly' },
      { id: 'workouts', title: '跑过的路，都有回声', text: '和自己以往相近距离的运动相比，再看心率、配速和轨迹。', scene: 'workouts' },
      { id: 'gaps', title: '绝不编造', text: '没测到就留白。不拿 0、上一次的值或估算值填空。', scene: 'gaps' },
    ] },
    { id: 'ai', name: '交给 AI', title: '复用已有订阅，不多花一分钱。', lead: '选好日子，记录变成一个文件。交给常用的 AI，继续对话，再把初稿带回来。', points: [
      { id: 'providers', title: '七家任选', text: 'ChatGPT、Claude、Gemini、Kimi、DeepSeek、豆包、Grok。沿用你已有的账号和额度。', scene: 'ai' },
      { id: 'prompt', title: '问什么，你说了算', text: '预设的问题可以改，也可以自己写。', scene: 'prompt' },
      { id: 'events', title: '事出有因', text: '记下感冒、旅行、出差，让 AI 多了解一点起伏背后的背景。', scene: 'events' },
      { id: 'autopaste', title: '全自动 · Windows', text: '打开后替你粘贴、发送，每一步先确认页面状态。默认关闭。', scene: 'autopaste' },
    ] },
    { id: 'ai-plan', name: '训练计划', title: '电脑上定稿，手表上开练。', lead: '把身体状况告诉 AI，它排好一周；粘回来，改到满意，再发到手表。', points: [
      { id: 'receive', title: '一键粘回', text: '从对话到初稿，复制回来就是一周计划。', scene: 'receive' },
      { id: 'edit', title: '计划由你', text: '拖动交换两天，点进每一天，再逐步改时长和强度。悬停就能看细节。', scene: 'plan-edit' },
      { id: 'templates', title: '模板与导入', text: '存成模板，下次接着练。也能导入 .zwo 和训练 .fit 文件。', scene: 'templates' },
      { id: 'easy', title: '今天累了', text: '今天排了间歇、准备度又低于平常时，一键换成轻松练。修改后由你确认发送。', scene: 'easy' },
    ] },
  ],
  records: {
    sleep: { title: '睡眠', text: '从一晚的分期，到近七天的变化。点开，向下看。' },
    workouts: { title: '运动', text: '看清这一次的全貌，也看见和以往的差别。' },
  },
  settings: {
    title: '设置页',
    lead: '大卡片逐张翻看，小卡片收成卡包。账号、同步、显示与数据管理，点开就能调整。',
    summaryTitle: '细节，都在设置里。',
    summaryLead: '十四项常用设置，一张卡叠收好。',
    items: [
      { id: 'sync', title: '自动同步', text: '关、15、30、60 分钟，一档就好。', icon: 'auto-sync' },
      { id: 'retention', title: '保留多久', text: '云端能取到的历史拉回本地，留多久你定。', icon: 'database' },
      { id: 'data', title: '数据内容', text: '哪些拉得到、哪些拉不到，一目了然。', icon: 'overview' },
      { id: 'mcp', title: 'MCP', text: 'Claude Code、Codex 等本机工具直接来问；发布计划需另行授权。', icon: 'structured-data' },
      { id: 'formats', title: '四种格式', text: 'JSON · CSV · GPX，运动页再加 FIT。', icon: 'document' },
      { id: 'units', title: '单位', text: '公里或英里，距离和配速一起切换。', icon: 'settings' },
      { id: 'time', title: '时间', text: '跟随地区，或 12 / 24 小时。', icon: 'auto-sync' },
      { id: 'date', title: '日期格式', text: '年月日的顺序，按你的习惯。', icon: 'document' },
      { id: 'scale', title: '界面缩放', text: '整个窗口，大小随心。', icon: 'overview' },
      { id: 'backup', title: '快照与恢复', text: '为数据库保存快照，需要时恢复。', icon: 'database' },
      { id: 'api', title: '本机 API', text: '只绑 127.0.0.1，只读访问，需要令牌。', icon: 'structured-data' },
      { id: 'privacy', title: '隐私与安全', text: '凭据交给系统保护，令牌不写进日志。', icon: 'browser-login' },
      { id: 'filename', title: '文件命名', text: '交给 AI 的文件叫什么，你来定。', icon: 'document' },
      { id: 'folder', title: '数据文件夹', text: '查看本机存储位置，按需备份与迁移。', icon: 'database' },
    ],
  },
  nav: [
    { label: '认识 ZeppBridge', links: [{ id: 'motion', label: '外观' }, { id: 'connection', label: '连接' }, { id: 'records', label: '看懂' }] },
    { label: '从记录到行动', links: [{ id: 'ai', label: '交给 AI' }, { id: 'ai-plan', label: '训练计划' }, { id: 'record-sleep', label: '睡眠与运动' }] },
    { label: '按你的习惯', links: [{ id: 'connect', label: '设置页' }, { id: 'set-mcp', label: 'MCP' }, { id: 'set-api', label: '本机 API' }] },
  ],
  demoPrompt: '下周三没空，保留一次间歇，其余安排轻松训练。',
};

export const P4_COPY: Partial<Record<LandingLocale, P4Copy>> = { zh };
for (const [path, module] of Object.entries(import.meta.glob<{ default: P4Copy }>('./p4/*.ts', { eager: true }))) {
  P4_COPY[path.slice('./p4/'.length, -'.ts'.length) as LandingLocale] = module.default;
}
