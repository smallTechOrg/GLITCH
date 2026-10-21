// m4g2 · Confidence Court component: tap-to-select / keyboard sort, wrong drops, fail, powers, labels.
import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m4g2';
import { ITEMS, SUMMARY, WRONG } from '@/games/m4g2/data';
import { ANSWER_KEY } from '@/games/m4g2/logic';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

const Game = game.Component;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId = 'scout') {
  const api = createTestGameApi({ hero });
  await renderWithProviders(<Game api={api} />);
  return api;
}

async function place(item: string, zone: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`dnd-item-${item}`));
  await fireEvent.press(screen.getByTestId(`dnd-zone-${zone}`));
}

async function flush(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('m4g2 Confidence Court', () => {
  it('renders the court heading, TRUST/VERIFY zones and every answer with its confidence and evidence', async () => {
    await setup();
    expect(screen.getByText('THE COURT OF EVIDENCE')).toBeTruthy();
    expect(screen.getByText('TRUST = the evidence checks out. VERIFY = needs a human check first.')).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-trust')).toBeTruthy();
    expect(screen.getByTestId('dnd-zone-verify')).toBeTruthy();
    const pool = screen.getByTestId('dnd-pool');
    for (const it of ITEMS) {
      expect(within(pool).getByText(it.statement)).toBeTruthy();
      expect(within(pool).getByText(`CONFIDENCE ${it.confidence}% · EVIDENCE: ${it.evidence}`)).toBeTruthy();
    }
  });

  it('is won by tap-to-select with no mistakes (3 stars), 350 ms after the last placement', async () => {
    const api = await setup();
    for (const [item, zone] of ANSWER_KEY) await place(item, zone);
    await flush(349);
    expect(api.calls.win).toHaveLength(0);
    await flush(1);
    expect(api.calls.win).toEqual([SUMMARY]);
    expect(api.hearts).toBe(3);
  });

  it('is playable by keyboard activation (Enter/Space → press)', async () => {
    const api = await setup();
    for (const [item, zone] of ANSWER_KEY) {
      await fireEvent(screen.getByTestId(`dnd-item-${item}`), 'press');
      await fireEvent(screen.getByTestId(`dnd-zone-${zone}`), 'press');
    }
    await flush(350);
    expect(api.calls.win).toEqual([SUMMARY]);
  });

  it('trusting a confident but unsupported answer costs a heart with the v3 message', async () => {
    const api = await setup();
    await place('a5', 'trust');
    expect(api.calls.miss).toEqual([WRONG]);
    expect(api.hearts).toBe(2);
  });

  it('sending the low-confidence a6 to VERIFY is wrong', async () => {
    const api = await setup();
    await place('a6', 'verify');
    expect(api.calls.miss).toEqual([WRONG]);
  });

  it('shows the 26-character short label once placed', async () => {
    await setup();
    await place('a2', 'verify');
    expect(within(screen.getByTestId('dnd-zone-verify')).getByText('The Eiffel Tower was built')).toBeTruthy();
  });

  it('three wrong moves → out of hearts; later input is ignored and no win fires', async () => {
    const api = await setup();
    await place('a1', 'verify');
    await place('a2', 'trust');
    await place('a3', 'trust');
    expect(api.status).toBe('failed');
    expect(api.hearts).toBe(0);
    for (const [item, zone] of ANSWER_KEY) await place(item, zone);
    await flush(1000);
    expect(api.calls.win).toHaveLength(0);
  });

  it('X-RAY places a1 in TRUST; FOCUS flashes the glowing pair', async () => {
    const scout = await setup('scout');
    await act(async () => {
      expect(scout.usePower()).toBe(true);
    });
    expect(within(screen.getByTestId('dnd-zone-trust')).getByTestId('dnd-item-a1')).toBeTruthy();
    expect(scout.lastSay()?.text).toBe('X-RAY: that one goes in TRUST.');
  });

  it('FOCUS (ORACLE) is consumed and says "look at the glowing pair"', async () => {
    const api = await setup('oracle');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(api.lastSay()?.text).toBe('FOCUS: look at the glowing pair.');
    await flush(2200);
  });

  it('announces selection and placement through accessible labels', async () => {
    await setup();
    const item = screen.getByTestId('dnd-item-a4');
    expect(item.props.accessibilityLabel).toBe('Your essay has 412 words. CONFIDENCE 90% · EVIDENCE: Word counter agrees: 412');
    await fireEvent.press(item);
    expect(screen.getByTestId('dnd-item-a4').props.accessibilityLabel).toMatch(/, selected$/);
    await fireEvent.press(screen.getByTestId('dnd-zone-trust'));
    expect(within(screen.getByTestId('dnd-zone-trust')).getByTestId('dnd-item-a4').props.accessibilityLabel).toMatch(/, placed in TRUST$/);
    expect(screen.getByTestId('dnd-zone-trust').props.accessibilityLabel).toBe('TRUST zone, 1 placed');
  });

  it('unmounting before the win delay cancels the win (no stale timer fires)', async () => {
    const api = await setup();
    for (const [item, zone] of ANSWER_KEY) await place(item, zone);
    await flush(100);
    await screen.unmount();
    await flush(1000);
    expect(api.calls.win).toHaveLength(0);
  });
});
