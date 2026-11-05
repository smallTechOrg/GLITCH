// Storytime is deliberately short: at most 7 slides a module, one short line a slide.
import { COURSE_ORDER, moduleNumber } from '@/content/modules';
import { STORY, slideText } from '@/content/story';
import { storyHint, storyKeyAction, storyKeyForTarget } from '@/screens/StoryScreen';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn(), replace: jest.fn() } }));

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

describe('STORY content', () => {
  it('has at most 7 slides in each module', () => {
    for (const m of COURSE_ORDER) expect(STORY[m].length).toBeLessThanOrEqual(7);
  });

  it('keeps every slide to at most 20 words', () => {
    const long = COURSE_ORDER.flatMap((m) => STORY[m].filter((s) => words(s.x) > 20).map((s) => s.x));
    expect(long).toEqual([]);
  });

  it('title slides carry the number players see, in course order', () => {
    for (const m of COURSE_ORDER) {
      const title = STORY[m][0];
      expect(title?.t).toBe('title');
      if (title?.t === 'title') expect(title.h).toBe(`MODULE ${moduleNumber(m)}`);
    }
  });

  it('icons slides have one caption per icon', () => {
    for (const m of COURSE_ORDER) {
      for (const s of STORY[m]) if (s.t === 'icons') expect(s.cap).toHaveLength(s.ic.length);
    }
  });

  it('the first module introduces NOVA, because players now meet NOVA there', () => {
    expect(STORY[COURSE_ORDER[0]!].some((s) => s.t === 'scene' && s.w === 'n' && s.x.includes("I'm NOVA"))).toBe(true);
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
