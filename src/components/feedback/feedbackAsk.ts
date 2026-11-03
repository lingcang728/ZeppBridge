/** 「昨天的「间歇跑」感觉怎么样？」——概览轻卡和系统通知共用这一份写法。 */
import { addDays, dayKey } from '../../lib/aiTask/bridgeScale';
import { today as currentToday } from '../../lib/currentDay';
import { displayDateTimeFormatter, parseDisplayDate } from '../../lib/dateTime';
import type { FeedbackPrompt } from '../../types/feedback';

interface AskText {
  ask: (day: string, name: string) => string;
  today: string;
  yesterday: string;
}

export const feedbackDayWord = (date: string, t: AskText): string => {
  const today = dayKey(currentToday());
  if (date === today) return t.today;
  if (date === addDays(today, -1)) return t.yesterday;
  return displayDateTimeFormatter({ weekday: 'long' }).format(parseDisplayDate(date));
};

export const feedbackAsk = (prompt: FeedbackPrompt, t: AskText): string =>
  t.ask(feedbackDayWord(prompt.date, t), prompt.planned.name);
