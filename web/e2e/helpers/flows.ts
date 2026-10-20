// Reusable journeys against the testIDs fixed in spec/ui.md → Test IDs (RN Web renders
// testID as data-testid). Tap-to-select paths are used for determinism; dragTo() is the
// real pointer drag and keyboard helpers drive Tab/Enter.
import { expect, type Page } from '@playwright/test';
import { waitForApp } from './fixtures';

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

/** Sort by tap-to-select: [itemId, zoneId] pairs. */
export async function sortByTap(page: Page, pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [item, zone] of pairs) {
    await page.getByTestId(`dnd-item-${item}`).click();
    await page.getByTestId(`dnd-zone-${zone}`).click();
    await expect(page.getByTestId(`dnd-zone-${zone}`).getByTestId(`dnd-item-${item}`)).toBeVisible();
  }
}

/** Real pointer drag of a sort item onto a zone (8 px threshold is crossed in steps). */
export async function dragTo(page: Page, itemId: string, zoneId: string): Promise<void> {
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
  await page.getByTestId(`dnd-item-${itemId}`).scrollIntoViewIfNeeded();
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
export async function sortByKeyboard(page: Page, pairs: ReadonlyArray<readonly [string, string]>): Promise<void> {
  for (const [item, zone] of pairs) {
    await page.getByTestId(`dnd-item-${item}`).focus();
    await page.keyboard.press('Enter');
    await page.getByTestId(`dnd-zone-${zone}`).focus();
    await page.keyboard.press('Enter');
  }
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
