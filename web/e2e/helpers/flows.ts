// Reusable journeys against the testIDs fixed in spec/ui.md → Test IDs (RN Web renders
// testID as data-testid). Tap-to-select paths are used for determinism; dragTo() is the
// real pointer drag and keyboard helpers drive Tab/Enter.
import { expect, type Page } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../../src/contracts/state';
import { waitForApp } from './fixtures';

export type Pair = readonly [string, string];

/** Train the Model's correct calls: round 1 trains the model, round 2 tests it on new emails. */
export const M1G1_ROUND1: readonly Pair[] = [['e1', 'spam'], ['e2', 'ok'], ['e3', 'spam'], ['e4', 'ok'], ['e5', 'spam'], ['e6', 'ok']];
export const M1G1_ROUND2: readonly Pair[] = [['t1', 'ok'], ['t2', 'spam'], ['t3', 'ok'], ['t4', 'spam']];

/** Every step of Prompt Forge, the course's first module. */
export const FIRST_MODULE_STEPS = ['m2h', 'm2s', 'm2g2', 'm2g1'] as const;

/** Seed a device's save (once per context, before boot) with these steps done. */
export async function seedSteps(page: Page, steps: readonly string[], hero = 'scout', patch: Record<string, unknown> = {}): Promise<void> {
  const state = {
    version: 1,
    profile: { nickname: 'E2E', onboarded: true, createdAt: new Date().toISOString() },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: Object.fromEntries(steps.map((s) => [s, true])),
    stars: Object.fromEntries(steps.filter((s) => /^m\dg\d$/.test(s)).map((s) => [s, 2])),
    heroByModule: { 1: hero, 2: hero, 3: hero, 4: hero },
    lastHero: hero,
    heroesPlayed: {},
    powersUsed: {},
    badges: {},
    onceBonuses: {},
    promptHistory: [],
    ...patch,
  };
  await page.addInitScript(
    ([key, value]) => {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
    },
    [STATE_STORAGE_KEY, JSON.stringify(state)] as const,
  );
}

/** Fresh device → Welcome → (optional nickname) → Home. */
export async function onboard(page: Page, nickname?: string): Promise<void> {
  await page.goto('./');
  await waitForApp(page);
  await expect(page.getByTestId('welcome-nickname-input')).toBeVisible();
  if (nickname) {
    await page.getByTestId('welcome-nickname-input').fill(nickname);
    await page.getByTestId('welcome-start').click();
  } else {
    await page.getByTestId('welcome-skip').click();
  }
  await expect(page.getByTestId('home-greeting')).toBeVisible();
}

/** Skip a storytime cutscene. */
export async function skipStory(page: Page): Promise<void> {
  await page.getByTestId('story-skip').click();
}

/** In a one-at-a-time deck, bring the item on show. No-op on boards that show every item. */
export async function showItem(page: Page, itemId: string): Promise<void> {
  const tab = page.getByTestId(`deck-tab-${itemId}`);
  if (await tab.count()) await tab.click();
  await expect(page.getByTestId(`dnd-item-${itemId}`)).toBeVisible();
}

/** Select an item and tap a zone, right or wrong. */
export async function tapItem(page: Page, item: string, zone: string): Promise<void> {
  await showItem(page, item);
  await page.getByTestId(`dnd-item-${item}`).click();
  await page.getByTestId(`dnd-zone-${zone}`).click();
}

/** Sort by tap-to-select: [itemId, zoneId] pairs. */
export async function sortByTap(page: Page, pairs: ReadonlyArray<Pair>): Promise<void> {
  for (const [item, zone] of pairs) {
    await tapItem(page, item, zone);
    await expect(page.getByTestId(`dnd-zone-${zone}`).getByTestId(`dnd-item-${item}`)).toBeVisible();
  }
}

/** Real pointer drag of a sort item onto a zone (8 px threshold is crossed in steps). */
export async function dragTo(page: Page, itemId: string, zoneId: string): Promise<void> {
  await showItem(page, itemId);
  const item = page.getByTestId(`dnd-item-${itemId}`);
  const zone = page.getByTestId(`dnd-zone-${zoneId}`);
  const a = await item.boundingBox();
  const b = await zone.boundingBox();
  if (!a || !b) throw new Error(`dragTo: ${itemId} or ${zoneId} not visible`);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

/**
 * A quick, human-speed flick: only `moves` pointer moves, 16 ms apart, so the first move
 * already leaves the item (regression: such drags used to be silently ignored).
 */
export async function quickDragTo(page: Page, itemId: string, zoneId: string, moves = 3): Promise<void> {
  await showItem(page, itemId);
  const a = await page.getByTestId(`dnd-item-${itemId}`).boundingBox();
  const b = await page.getByTestId(`dnd-zone-${zoneId}`).boundingBox();
  if (!a || !b) throw new Error(`quickDragTo: ${itemId} or ${zoneId} not visible`);
  const [sx, sy, tx, ty] = [a.x + a.width / 2, a.y + a.height / 2, b.x + b.width / 2, b.y + b.height / 2];
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= moves; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / moves, sy + ((ty - sy) * i) / moves);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

/** Keyboard-only sort: focus the item, Enter selects; focus the zone, Enter drops. */
export async function sortByKeyboard(page: Page, pairs: ReadonlyArray<Pair>): Promise<void> {
  for (const [item, zone] of pairs) {
    const tab = page.getByTestId(`deck-tab-${item}`);
    if (await tab.count()) {
      await tab.focus();
      await page.keyboard.press('Enter');
    }
    await page.getByTestId(`dnd-item-${item}`).focus();
    await page.keyboard.press('Enter');
    await page.getByTestId(`dnd-zone-${zone}`).focus();
    await page.keyboard.press('Enter');
  }
}

/** Train the Model: make each call by tap. Calls stay unjudged until VERIFY. */
export async function callByTap(page: Page, pairs: ReadonlyArray<Pair>): Promise<void> {
  for (const [item, zone] of pairs) {
    await page.getByTestId(`dnd-item-${item}`).click();
    await page.getByTestId(`dnd-zone-${zone}`).click();
    await expect(page.getByTestId(`m1g1-call-${item}`)).toHaveText(zone === 'spam' ? 'SPAM?' : 'NOT SPAM?');
  }
}

/** Train the Model: both rounds, all correct, up to the TRAINING VS TESTING result. */
export async function playTrainTheModel(page: Page): Promise<void> {
  await callByTap(page, M1G1_ROUND1);
  await page.getByTestId('m1g1-verify').click();
  await page.getByTestId('m1g1-next').click();
  await callByTap(page, M1G1_ROUND2);
  await page.getByTestId('m1g1-verify').click();
  await page.getByTestId('m1g1-next').click();
  await expect(page.getByTestId('m1g1-result')).toBeVisible();
}

/** Set a slider from the keyboard. Sliders start at 0, so the player does all the setting. */
export async function setSlider(page: Page, id: string, value: number): Promise<void> {
  await page.getByTestId(`slider-${id}`).focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < Math.floor(value / 10); i++) await page.keyboard.press('PageUp');
  for (let i = 0; i < value % 10; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId(`slider-${id}-value`)).toHaveText(String(value));
}

/** Tap pick-the-line lines by 0-based v3 index. */
export async function pickLines(page: Page, indices: readonly number[]): Promise<void> {
  for (const i of indices) await page.getByTestId(`pick-line-${i}`).click();
}

/** Assert the win screen (and optionally the star count). */
export async function expectWin(page: Page, stars?: number): Promise<void> {
  await expect(page.getByTestId('win-screen')).toBeVisible();
  if (stars !== undefined) await expect(page.getByTestId('win-stars')).toHaveAttribute('aria-label', `${stars} stars`);
}
