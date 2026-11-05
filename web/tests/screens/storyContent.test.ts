// Storytime content is v3 verbatim (spec/idea/GLITCH v3.html lines 382–428): 41 slides in
// 11/10/10/10, every text, heading, title line and icon caption present in the source.
import fs from 'fs';
import path from 'path';
import { STORY, slideText } from '@/content/story';
import { storyHint, storyKeyAction, storyKeyForTarget } from '@/screens/StoryScreen';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), replace: jest.fn() } }));

const V3 = fs.readFileSync(path.join(__dirname, '../../../spec/idea/GLITCH v3.html'), 'utf8').replace(/\\'/g, "'");

describe('STORY content', () => {
  it('has 41 slides split 11/10/10/10', () => {
    expect([1, 2, 3, 4].map((m) => STORY[m as 1 | 2 | 3 | 4].length)).toEqual([11, 10, 10, 10]);
  });

  it('every string appears verbatim in the v3 source', () => {
    const missing: string[] = [];
    for (const m of [1, 2, 3, 4] as const) {
      for (const s of STORY[m]) {
        const parts = [s.x, ...(s.t === 'key' ? [s.k] : []), ...(s.t === 'title' ? [s.h, s.s] : []), ...(s.t === 'icons' ? s.cap : [])];
        for (const p of parts) if (!V3.includes(p)) missing.push(p);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every slide starts with a title and icons slides have 8 icons with 8 captions', () => {
    for (const m of [1, 2, 3, 4] as const) {
      expect(STORY[m][0]?.t).toBe('title');
      for (const s of STORY[m]) if (s.t === 'icons') expect([s.ic.length, s.cap.length]).toEqual([8, 8]);
    }
  });

  it('title slides type nothing (shown at once); other slides type their text', () => {
    expect(slideText(STORY[1][0]!)).toBe('');
    expect(slideText(STORY[1][1]!)).toBe(STORY[1][1]!.x);
  });
});

describe('storytime controls', () => {
  it('maps Space/Enter/→ to next, ← to previous, Esc to finish, anything else to nothing', () => {
    expect([' ', 'Enter', 'ArrowRight'].map(storyKeyAction)).toEqual(['next', 'next', 'next']);
    expect(storyKeyAction('ArrowLeft')).toBe('prev');
    expect(storyKeyAction('Escape')).toBe('finish');
    expect(storyKeyAction('a')).toBeNull();
    expect(storyKeyAction('Tab')).toBeNull();
  });

  it('does not double-handle Enter/Space on a focused SKIP or slide (their own press fires)', () => {
    expect(storyKeyForTarget('Enter', 'story-skip')).toBeNull();
    expect(storyKeyForTarget(' ', 'story-root')).toBeNull();
    expect(storyKeyForTarget('ArrowLeft', 'story-root')).toBe('prev');
    expect(storyKeyForTarget('Escape', 'story-skip')).toBe('finish');
    expect(storyKeyForTarget('ArrowRight', undefined)).toBe('next');
  });

  it('hint reads the v3 line, adds " · ◄ BACK" after slide 1, and just "TAP TO CONTINUE" on touch', () => {
    expect(storyHint(0, false)).toBe('CLICK · SPACE · ► TO CONTINUE');
    expect(storyHint(3, false)).toBe('CLICK · SPACE · ► TO CONTINUE · ◄ BACK');
    expect(storyHint(0, true)).toBe('TAP TO CONTINUE');
    expect(storyHint(2, true)).toBe('TAP TO CONTINUE');
  });
});
