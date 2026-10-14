import type { Director } from '../director';
import type { Chapter, Shot } from '../types';
import { filmLocale, filmScript } from '../copy';
import { lookIntro, prologue } from './look';
import { lookCards, openTable } from './cards';
import { finale } from './settings';

/**
 * 一分钟短片（10-14 用户：发社交平台，节奏和转场照样片）。只留两样最大的特色：
 * ① 视觉动效——玻璃、卡↔页形变、牌墙与扑克牌、交给 AI 线条卡、设置大卡；
 * ② 训练计划——把身体状况连同记录发给 AI → AI 排好一周 → 电脑上定稿、手表上开练。
 * 切点落在 120 BPM 的拍子上（每镜都是 0.5 秒的整数倍），整片 59 秒；配乐换曲只要换拍子。
 * 网站开场放的也是这一版；完整长版用 `?cut=full`。
 */
const TABLE = '.card-table';
const DAY = `${TABLE} button.pcard.day:not(.disabled)`;
const MONTH = `${TABLE} button.pcard.month:not(.empty)`;
const WEEK = `${TABLE} button.pcard.week:not(.empty)`;
const BOX = '#card-collection-box:not(.empty)';
const SEND = 'button.lock:not(:disabled)';

const shot = (list: Shot[], id: string): Shot => {
  const found = list.find((item) => item.id === id);
  if (!found) throw new Error(`Film shot missing: ${id}`);
  return found;
};
/** 沿用长版的一镜，只改时长（和姿态 / 字幕）。 */
const reuse = (list: Shot[], id: string, ms: number, extra: Partial<Shot> = {}): Shot => ({ ...shot(list, id), ms, ...extra });

/** 展示墙：窗口正面浮在光晕上，镜头缓缓推近（10-14 用户：不要左右侧转）。 */
const wall = (id: string, kind: 'glass' | 'cards', caption: Shot['caption'], ms: number): Shot => ({
  id, ms, pose: 'full', caption,
  async run(d) {
    await d.cut(async () => { await d.wall(kind); });
    await d.wait(500);
    await d.camera(d.all(`.film-wall.${kind} .wall-row`), { zoom: 1.16, fill: 1, ms: ms - 1200, hold: ms - 1200 });
  },
});

/**
 * 片头：先只有光晕（约一秒），这时在看不见的窗口里把后面要用的先走一遍——展示墙模块、「交给 AI」页、
 * 设置页第一次打开都要几百毫秒，放进镜头里做画面会停一下（录像里整整停过 0.7 秒）；最后把玻璃墙先挂好。
 * 预热完标语才逐字入焦（入焦时页面已经闲下来，字不会卡）。
 */
const opening: Shot = {
  ...shot(prologue.shots, 'tagline'), ms: 3000, caption: null,
  async run(d) {
    const start = d.clock.elapsed();
    await shot(prologue.shots, 'tagline').run(d);
    for (const path of ['/ai', '/settings', '/']) await d.go(path, 0);
    await d.wall('glass');
    await d.settle(600);
    // 1.5 秒（第三拍）上字，和配乐的钟片动机对齐（compose-score.py 的 TAGLINE_AT）；预热一般要 1.4 秒左右。
    const rest = 1500 - (d.clock.elapsed() - start);
    if (rest > 0) await d.clock.wait(rest);
    d.caption('tagline');
  },
};

/** 玻璃墙：墙在片头就挂好了，这一镜只是窗口从模糊里浮出来、镜头推近。 */
const glass: Shot = {
  id: 'glass', ms: 4000, pose: 'full', caption: 'glass',
  async run(d) {
    await d.wait(300);
    await d.camera(d.all('.film-wall.glass .wall-row'), { zoom: 1.16, fill: 1, ms: 2600, hold: 2600 });
  },
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const pileOnto = async (d: Director, from: HTMLElement, onto: HTMLElement) => {
  await d.steady(from); await d.steady(onto);
  const a = d.center(from), b = d.center(onto);
  await d.drag(from, { x: b.x - a.x, y: b.y - a.y }, { ms: 480, settle: 380, grab: 140 });
  return b;
};

export const short: Chapter = {
  id: 'short',
  label: 'tagline',
  shots: [
    opening,
    glass,
    reuse(lookIntro, 'morph', 4000),
    wall('deckwall', 'cards', 'poker', 3000),
    {
      // 一层层展开：6 个月 → 点进一月（月牌收到左上角、周牌展开）→ 点进一周（日牌展开）。
      id: 'layers', ms: 6500, pose: 'full', caption: 'poker',
      async run(d) {
        await d.cut(() => openTable(d));
        await d.tap(await d.find(`${TABLE} .segment-item`, { index: 2 }), { after: 500, travel: 240 });
        await d.tap(await d.find(MONTH, { index: 5 }), { after: 600 });
        await d.tap(await d.find(WEEK, { index: 1 }), { after: 500 });
      },
    },
    {
      // 叠成一叠、长按整叠飞进箱子；打开收集箱，一手牌摊开；清空，逐张落下消失（也把箱子收掉，不挡下一镜）。
      id: 'pile', ms: 7500, pose: 'full', caption: 'pile',
      async run(d) {
        // 上一镜最后点进一周，日牌还在发牌途中：等它们落定再量位置，不然按半路的位置拖，落点偏出一百多像素、叠不上。
        await d.settle();
        const days = d.all(DAY);
        if (days.length >= 3) {
          const target = await pileOnto(d, days[days.length - 1]!, days[days.length - 2]!);
          // 叠好后牌会重新渲染，原来那个元素可能已经不在了：按落点重新找那一叠再长按。
          await d.settle(800);
          const nearest = d.all(DAY).sort((a, b) => dist(d.center(a), target) - dist(d.center(b), target))[0];
          if (nearest) await d.hold(nearest, 600, { after: 400 });
        }
        // 万一长按没把整叠送进去：改用翻面点「✓ 交给 AI」送一张，箱子不能空着开。
        // 牌飞进箱子要一会儿，箱子落定才变成「有牌」：先等它，真没进去再兜底。
        const filled = await d.find(BOX, { limit: 2500 }).then(() => true, () => false);
        if (!filled) {
          await d.tap(await d.find(DAY, { index: 1 }), { after: 400 });
          await d.tap(`${TABLE} .pcard.confirm .back-send`, { after: 500 });
        }
        await d.tap(BOX, { after: 600 });
        await d.tap('.box-spread .spread-foot .foot-button', { after: 650 });
      },
    },
    reuse(lookCards, 'lines', 5000),
    reuse(lookCards, 'deck', 4500),
    {
      // 章节卡：训练计划，交给 AI。窗口退场时在后面换到「交给 AI」页，台词换成这一版。
      id: 'planIntro', ms: 1500, pose: 'title', caption: 'planIntro',
      async run(d) {
        d.hidePointer();
        await d.clear();
        await d.go('/ai', 200);
        d.api.script([{ prompt: filmScript(filmLocale(d.locale)).prompt, answer: filmScript(filmLocale(d.locale)).answer }]);
      },
    },
    {
      // 身体怎样，直接告诉它：在自定义问题里一个字一个字写下身体状况。
      id: 'tell', ms: 3000, pose: 'full', caption: 'tell',
      async run(d) {
        await d.camera('.fcard', { zoom: 1.6, fill: 0.85, ms: 500, hold: 100 });
        const field = d.all('.fcard textarea, .fcard input')[0];
        if (field) await d.type(field, filmScript(filmLocale(d.locale)).prompt, { replace: true, perChar: filmLocale(d.locale) === 'zh' ? 34 : 14 });
        await d.camera(null, { ms: 400, hold: 100 });
      },
    },
    {
      // AI 读完记录，排好一周：长按发出 → AI 回一段（附件、思考、回复）→ 计划整理好、复制、接回。
      id: 'chat', ms: 7000, pose: 'full', caption: 'summarize',
      async run(d) {
        d.api.pace(0.16);
        await d.hold(SEND, 1150, { after: 700 }); // BridgeLock 按满 950ms 才发射
        await d.tap('dialog[open] .conversation-send', { after: 200 });
        const dialog = await d.find('dialog[open].demo-conversation') as HTMLDialogElement;
        for (let n = 0; n < 160 && dialog.open && dialog.dataset.state !== 'return'; n++) await d.clock.wait(80);
      },
    },
    {
      // 电脑上定稿，手表上开练：一周计划落到电脑上，窗口让到左边、手表进来；长按发到手表，训练卡飞过去，表盘亮起。
      id: 'toWatch', ms: 6000, pose: 'watch', caption: 'toWatch',
      async run(d) {
        await d.cut(async () => { await d.clear(); d.api.script(null); await d.go('/ai/plan', 200); });
        d.watch('shown');
        await d.wait(700);
        const hold = await d.hold('.main-content .page button.hold-button', 1000, { after: 300 });
        const first = d.all('a.future-day:not(.rest)')[0] ?? hold;
        d.watch('lit', first, 1000);
        await d.wait(1600);
      },
    },
    reuse(finale.shots, 'free', 1500, { async run(d) { d.hidePointer(); d.watch('hidden'); await d.clear(); } }),
    reuse(finale.shots, 'try', 2500),
  ],
};
