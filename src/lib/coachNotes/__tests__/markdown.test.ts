import { describe, expect, it } from 'vitest';
import { coachNotesMarkdown } from '../markdown';
import type { CoachNote } from '../../../types/coachNotes';

const note = (id: number, text: string, source: 'user' | 'mcp', name: string | null = null): CoachNote => ({
  id, text, state: 'accepted', source, source_name: name,
  created_at: '2026-10-20T08:00:00Z', updated_at: '2026-10-20T08:00:00Z', decided_at: null,
});

const text = {
  title: 'My coach notes', intro: 'Facts I confirmed.', empty: 'Nothing yet.',
  byUser: 'written by me', byAi: (name: string | null) => `proposed by ${name ?? 'an AI'}`, since: (date: string) => `since ${date}`,
};

describe('coachNotesMarkdown', () => {
  it('says who wrote every note and keeps each note on one line', () => {
    const md = coachNotesMarkdown([note(1, 'Left knee\nhurts past 15 km', 'mcp', 'Claude'), note(2, 'Swims Wednesdays', 'user')], text);
    expect(md.startsWith('# My coach notes\n\nFacts I confirmed.\n')).toBe(true);
    expect(md).toContain('- Left knee hurts past 15 km  \n  _proposed by Claude · since 2026-10-20_');
    expect(md).toContain('- Swims Wednesdays  \n  _written by me · since 2026-10-20_');
  });

  it('writes an honest empty file instead of nothing', () => {
    expect(coachNotesMarkdown([], text)).toContain('Nothing yet.');
  });
});
