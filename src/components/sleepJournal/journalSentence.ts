/**
 * 今日一问「昨晚睡得怎么样」后面接的那一句：「昨晚睡前：咖啡、睡前刷屏。醒来感觉：困。」
 * 按当时的界面语言写（问题本身也是）；没记就是空串。
 */
import { MOOD_BY_CODE, TAG_BY_CODE } from './journalCodes';
import type { SleepJournalEntry } from '../../types/sleepJournal';
import type { useSleepJournalText } from './sleepJournal.i18n';

type Text = ReturnType<typeof useSleepJournalText>['value'];

export const journalSentence = (entry: SleepJournalEntry | null, t: Text): string => {
  if (!entry) return '';
  const names = entry.behaviors.map((code) => TAG_BY_CODE.get(code)).flatMap((tag) => (tag ? [t.tagInSentence(t.tag[tag.key])] : []));
  const mood = entry.mood ? MOOD_BY_CODE.get(entry.mood) : undefined;
  return [names.length ? t.extraBefore(names.join(t.listJoin)) : '', mood ? t.extraMood(t.moodInSentence[mood.key]) : '']
    .filter(Boolean)
    .join(t.sentenceGap);
};
