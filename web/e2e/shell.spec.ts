// Course shell E2E (slice A1): onboarding, Home on a fresh device, hero select → storytime
// (keyboard controls) → game frame, module complete once-bonus, settings + reset, locked and
// unknown deep links, state surviving reloads. Runs at the Phase 1 gate (needs every slice).
import type { Page } from '@playwright/test';
import { STATE_STORAGE_KEY } from '../src/contracts/state';
import { test, expect, waitForApp } from './helpers/fixtures';
import { onboard } from './helpers/flows';

const isoNow = (): string => new Date().toISOString();

/** Seed a device's saved progress before the app loads (once per context). */
async function seed(page: Page, patch: Record<string, unknown>): Promise<void> {
  const state = {
    version: 1,
    profile: { nickname: null, onboarded: true, createdAt: isoNow() },
    settings: { readableFont: false },
    xp: 0,
    streak: { current: 0, best: 0, lastPlayDay: null },
    steps: {},
    stars: {},
    heroByModule: {},
    lastHero: 'scout',
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

test.describe('onboarding + Home', () => {
  test('fresh device: Skip → PLAYER 1, LVL 1, 10 XP, streak 1, Module 1 open, 2–4 locked, 0/12 badges', async ({ page }) => {
    await onboard(page);
    await expect(page.getByTestId('home-greeting')).toHaveText('PLAYER 1');
    await expect(page.getByTestId('xp-level')).toHaveText('LVL 1');
    await expect(page.getByTestId('xp-text')).toHaveText('10/100 XP');
    await expect(page.getByTestId('streak-chip')).toContainText('1');
    await expect(page.getByTestId('module-status-1')).toHaveText('0/4 STEPS');
    for (const n of [2, 3, 4]) await expect(page.getByTestId(`module-status-${n}`)).toHaveText('LOCKED');
    await expect(page.getByTestId('badges-count')).toHaveText('BADGES · 0/12');
    await expect(page.getByTestId('home-quest')).toContainText('START HERE');
  });

  test('nickname is used as the greeting and survives a reload', async ({ page }) => {
    await onboard(page, '  Ada  ');
    await expect(page.getByTestId('home-greeting')).toHaveText('Ada');
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId('home-greeting')).toHaveText('Ada');
    await expect(page.getByTestId('xp-text')).toHaveText('10/100 XP'); // same day: no second daily
  });

  test('the top bar is hidden on welcome and shown on Home', async ({ page }) => {
    await page.goto('./');
    await waitForApp(page);
    await expect(page.getByTestId('welcome-nickname-input')).toBeVisible();
    await expect(page.getByTestId('topbar')).toHaveCount(0);
    await page.getByTestId('welcome-skip').click();
    await expect(page.getByTestId('topbar')).toBeVisible();
  });
});

test.describe('hero select → storytime → game', () => {
  test('hero is saved, story keys work, finishing grants +10 XP once and opens the first game with that hero', async ({ page }) => {
    await onboard(page);
    await page.getByTestId('home-quest-button').click();
    await page.getByTestId('hero-card-guard').click();
    await page.getByTestId('hero-enter').click();

    await expect(page.getByTestId('story-root')).toBeVisible();
    await expect(page.getByTestId('topbar')).toHaveCount(0);
    const progress = page.getByTestId('story-progress');
    await expect(progress).toHaveAttribute('aria-label', 'Slide 1 of 11');
    await page.keyboard.press('Space');
    await expect(progress).toHaveAttribute('aria-label', 'Slide 2 of 11');
    await page.keyboard.press('ArrowRight'); // completes typing
    await expect(page.getByTestId('story-text')).toHaveText("Welcome to the Training Lab. Today's question: what is AI, really?");
    await page.keyboard.press('Enter');
    await expect(progress).toHaveAttribute('aria-label', 'Slide 3 of 11');
    await page.keyboard.press('ArrowLeft');
    await expect(progress).toHaveAttribute('aria-label', 'Slide 2 of 11');
    await expect(page.getByText('CLICK · SPACE · ► TO CONTINUE · ◄ BACK')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('game-title')).toContainText('Train the Model');
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', 'SHIELD power, 2 uses left');
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', 'Hearts 3 of 3');
    await expect(page.getByTestId('xp-text')).toHaveText('20/100 XP');

    // SHIELD: first press consumed, second not
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('shield-indicator')).toBeVisible();
    await expect(page.getByTestId('hearts')).toHaveAttribute('aria-label', 'Hearts 3 of 3, shield up');
    await page.getByTestId('power-button').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'NOTHING TO USE IT ON YET' })).toBeVisible();
    await expect(page.getByTestId('power-button')).toHaveAttribute('aria-label', 'SHIELD power, 1 use left');

    // replaying the story later grants no more XP
    await page.goto('./module/1/story');
    await waitForApp(page);
    await page.getByTestId('story-skip').click();
    await expect(page.getByTestId('game-title')).toBeVisible();
    await expect(page.getByTestId('xp-text')).toHaveText('20/100 XP');
  });
});

test.describe('module complete', () => {
  test('grants +50 once; revisiting grants nothing; Start Module 2 opens its hero select', async ({ page }) => {
    await seed(page, { steps: { m1h: true, m1s: true, m1g1: true, m1g2: true } });
    await page.goto('./module/1/complete');
    await waitForApp(page);
    await expect(page.getByTestId('complete-screen')).toContainText('MODULE 1 COMPLETE');
    await expect(page.getByTestId('complete-xp-tag')).toHaveText('+50 XP');
    await expect(page.getByTestId('complete-screen')).toContainText('Module 2 is unlocked: Prompt Forge.');
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId('complete-screen')).toBeVisible();
    await expect(page.getByTestId('complete-xp-tag')).toHaveCount(0);
    await page.getByTestId('complete-next').click();
    await expect(page.getByTestId('hero-enter')).toContainText('Prompt Forge');
  });
});

test.describe('settings', () => {
  test('nickname change, readable font, and two-tap reset (keeps streak + nickname)', async ({ page }) => {
    await seed(page, {
      profile: { nickname: 'Neo', onboarded: true, createdAt: isoNow() },
      xp: 150,
      steps: { m1h: true, m1s: true },
      onceBonuses: { story1: true },
    });
    await page.goto('./settings');
    await waitForApp(page);
    await page.getByTestId('settings-nickname-input').fill('Trinity');
    await page.getByTestId('settings-save').click();
    await page.getByTestId('settings-readable-font').click();
    await expect(page.getByTestId('settings-readable-font')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('settings-reset').click();
    await expect(page.getByTestId('settings-reset')).toContainText('Tap again to erase XP, badges and progress');
    await page.getByTestId('settings-reset').click();
    await expect(page.getByTestId('xp-text')).toHaveText('0/100 XP');
    await page.getByTestId('topbar-home').click();
    await expect(page.getByTestId('home-greeting')).toHaveText('Trinity');
    await expect(page.getByTestId('module-status-1')).toHaveText('0/4 STEPS');
    await expect(page.getByTestId('streak-chip')).toContainText('1');
  });
});

test.describe('deep links', () => {
  test('a locked module shows the locked message with a Home button, never a crash', async ({ page }) => {
    await seed(page, {});
    await page.goto('./module/3/game/m3g1');
    await waitForApp(page);
    await expect(page.getByText('This step is locked. Finish the earlier steps first.')).toBeVisible();
    await page.getByTestId('locked-home').click();
    await expect(page.getByTestId('home-greeting')).toBeVisible();
  });

  test('an unknown path shows LOST IN THE GRID', async ({ page }) => {
    await page.goto('./no/such/place');
    await waitForApp(page);
    await expect(page.getByText('LOST IN THE GRID')).toBeVisible();
  });
});
