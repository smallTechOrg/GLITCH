// m3g2 · Fairness Lab — component behaviour against the frame-exact test GameApi: all-OFF start,
// toggles, live metrics + bars, audit pass/fail, the decide stage, case rotation, powers, a11y.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { HeroId } from '@/contracts/ids';
import game from '@/games/m3g2';
import { ACCURACY_GOAL, CASES, DECISION_HEAD, DECISION_RIGHT, DECISION_WRONG, GAP_GOAL, PASS_LINE, accuracyFailMessage, caseFor, focusLine, type FairnessCase } from '@/games/m3g2/data';
import { useGlitchStore } from '@/state/store';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';
import { NOTHING_TO_USE, SHIELDED_PREFIX } from '@/testing/testGameApi';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: HeroId = 'scout', fairnessCases = 0) {
  const api = createTestGameApi({ hero });
  const G = game.Component;
  await renderWithProviders(<G api={api} />, { state: { fairnessCases } });
  return api;
}

const tog = async (id: string) => {
  await fireEvent.press(screen.getByTestId(`toggle-${id}`));
};
const audit = async () => {
  await fireEvent.press(screen.getByTestId('m3g2-audit'));
};
const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};
const power = async (api: ReturnType<typeof createTestGameApi>) => {
  let r = false;
  await act(async () => {
    r = api.usePower();
  });
  return r;
};
const checked = (id: string): boolean | undefined => screen.getByTestId(`toggle-${id}`).props.accessibilityState?.checked;
const HIRING = CASES[0] as FairnessCase;
const skillsOf = (c: FairnessCase): string[] => c.features.filter((f) => f[2] === 's').map((f) => f[0]);
const rightOf = (c: FairnessCase) => c.options.find((o) => o.right)!;
const wrongOf = (c: FairnessCase) => c.options.find((o) => !o.right)!;
const pass = async (c: FairnessCase = HIRING) => {
  for (const id of skillsOf(c)) await tog(id);
  await audit();
};

describe('m3g2 definition', () => {
  it('registers as module 3 with the course metadata', () => {
    expect(game).toMatchObject({
      id: 'm3g2',
      module: 3,
      title: 'Fairness Lab',
      goal: 'MISSION: Gap 6 or less, accuracy 80 or more, then make the call',
      intro: 'Every input starts OFF. Choose what the AI may use.',
    });
    expect(game.steps).toHaveLength(3);
  });
});

describe('<Fairness Lab> audit', () => {
  it('starts with all 7 inputs OFF, GAP 2% and ACCURACY 50%, men 48% / women 46%', async () => {
    await setup();
    expect(screen.getByText(HIRING.heading)).toBeTruthy();
    for (const id of ['code', 'gpa', 'int', 'col', 'cap', 'brk', 'pc']) {
      expect(checked(id)).toBe(false);
      expect(screen.getByTestId(`toggle-${id}`)).toHaveTextContent(/OFF/);
    }
    expect(screen.getByTestId('metric-gap').props.accessibilityLabel).toBe(`GAP 2%, goal ≤${GAP_GOAL}, met`);
    expect(screen.getByTestId('metric-accuracy').props.accessibilityLabel).toBe(`ACCURACY 50%, goal ≥${ACCURACY_GOAL}, not met`);
    expect(screen.getByTestId('m3g2-group-a').props.accessibilityLabel).toBe('MEN SHORTLISTED 48%');
    expect(screen.getByTestId('m3g2-group-b').props.accessibilityLabel).toBe('WOMEN SHORTLISTED 46%');
    expect(screen.getByTestId('m3g2-group-b')).toHaveTextContent(/46%/);
  });

  it('toggles are labelled switches exposing their ON/OFF state', async () => {
    await setup();
    const el = screen.getByTestId('toggle-col');
    expect(el.props.accessibilityRole).toBe('switch');
    expect(el.props.accessibilityLabel).toBe("Women's college");
    await tog('col');
    expect(checked('col')).toBe(true);
    expect(screen.getByTestId('toggle-col')).toHaveTextContent(/ON/);
    await tog('col');
    expect(checked('col')).toBe(false);
  });

  it('switching a proxy on updates the gap, accuracy and group B bar live', async () => {
    await setup();
    await tog('col');
    expect(screen.getByTestId('metric-gap').props.accessibilityLabel).toBe('GAP 12%, goal ≤6, not met');
    expect(screen.getByTestId('metric-accuracy').props.accessibilityLabel).toBe('ACCURACY 52%, goal ≥80, not met');
    expect(screen.getByTestId('m3g2-group-b')).toHaveTextContent(/36%/);
  });

  it('auditing the untouched start costs a heart with the accuracy message', async () => {
    const api = await setup();
    await audit();
    expect(api.calls.miss).toEqual([accuracyFailMessage(50)]);
    expect(api.hearts).toBe(2);
    expect(screen.queryByTestId('m3g2-decide')).toBeNull();
  });

  it('auditing with a proxy on costs a heart with the gap message', async () => {
    const api = await setup();
    for (const id of [...skillsOf(HIRING), 'pc']) await tog(id);
    await audit();
    expect(api.calls.miss).toEqual(['The gap is still 7 points. Some proxies are still switched on.']);
  });

  it('three failed audits run out of hearts; further input is ignored', async () => {
    const api = await setup();
    await audit();
    await audit();
    await audit();
    expect(api.status).toBe('failed');
    await tog('col');
    expect(checked('col')).toBe(false);
    await audit();
    expect(api.calls.miss).toHaveLength(3);
  });

  it('the audit button is a labelled button', async () => {
    await setup();
    const b = screen.getByTestId('m3g2-audit');
    expect(b.props.accessibilityRole).toBe('button');
    expect(b).toHaveTextContent(/RUN AUDIT ▶/);
    expect(b.props.accessibilityLabel).toBe('RUN AUDIT');
  });
});

describe('<Fairness Lab> decide stage', () => {
  it('passing the audit does not win yet: it asks the case question', async () => {
    const api = await setup();
    await pass();
    expect(api.lastSay()).toEqual({ text: PASS_LINE, mood: 'good' });
    expect(api.calls.miss).toHaveLength(0);
    expect(api.calls.win).toHaveLength(0);
    expect(screen.getByText(DECISION_HEAD(HIRING.concern))).toBeTruthy();
    expect(screen.getByTestId('m3g2-question')).toHaveTextContent(HIRING.question);
    for (const o of HIRING.options) expect(screen.getByTestId(`m3g2-option-${o.id}`)).toHaveTextContent(o.text);
    expect(screen.queryByTestId('m3g2-audit')).toBeNull();
    await advance(5000);
    expect(api.calls.win).toHaveLength(0);
  });

  it('a wrong option costs a heart and locks only that option', async () => {
    const api = await setup();
    await pass();
    const w = wrongOf(HIRING);
    await fireEvent.press(screen.getByTestId(`m3g2-option-${w.id}`));
    expect(api.calls.miss).toEqual([DECISION_WRONG]);
    expect(api.hearts).toBe(2);
    expect(screen.getByTestId(`m3g2-option-${w.id}`).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId(`m3g2-option-${w.id}`));
    expect(api.calls.miss).toHaveLength(1);
    expect(screen.getByTestId(`m3g2-option-${rightOf(HIRING).id}`).props.accessibilityState?.disabled).toBe(false);
  });

  it('the right option wins 500 ms later with the case summary, once only', async () => {
    const api = await setup();
    await pass();
    await fireEvent.press(screen.getByTestId(`m3g2-option-${rightOf(HIRING).id}`));
    expect(api.lastSay()).toEqual({ text: DECISION_RIGHT, mood: 'good' });
    await advance(499);
    expect(api.calls.win).toHaveLength(0);
    await advance(1);
    expect(api.calls.win).toEqual([HIRING.summary]);
    expect(api.hearts).toBe(3);
    await fireEvent.press(screen.getByTestId(`m3g2-option-${rightOf(HIRING).id}`));
    await advance(1000);
    expect(api.calls.win).toHaveLength(1);
  });

  it('X-RAY names the right option in the decide stage without answering it', async () => {
    const api = await setup('scout');
    await pass();
    expect(await power(api)).toBe(true);
    expect(api.lastSay()?.text).toBe(`X-RAY: "${rightOf(HIRING).text}"`);
    expect(api.calls.win).toHaveLength(0);
    expect(api.powerUses).toBe(1);
  });

  it('FOCUS rules out a wrong option in the decide stage, at no heart cost', async () => {
    const api = await setup('oracle');
    await pass();
    const w = wrongOf(HIRING);
    expect(await power(api)).toBe(true);
    expect(api.lastSay()?.text).toBe(`FOCUS: not "${w.text}"`);
    expect(screen.getByTestId(`m3g2-option-${w.id}`).props.accessibilityState?.disabled).toBe(true);
    expect(api.hearts).toBe(3);
  });
});

describe('<Fairness Lab> cases', () => {
  it.each(CASES.map((c, i) => [c.id, i, c] as const))('%s renders its own inputs and can be cleared', async (_id, i, c) => {
    const api = await setup('scout', i);
    expect(screen.getByTestId(`m3g2-case-${c.id}`)).toBeTruthy();
    expect(screen.getByTestId('m3g2-heading')).toHaveTextContent(c.heading);
    expect(screen.getByTestId('m3g2-rule')).toHaveTextContent(c.rule);
    for (const [id, name] of c.features) expect(screen.getByTestId(`toggle-${id}`).props.accessibilityLabel).toBe(name);
    expect(screen.getByTestId('m3g2-group-a').props.accessibilityLabel).toBe(`${c.groupA} 48%`);
    await pass(c);
    expect(screen.getByTestId('m3g2-question')).toHaveTextContent(c.question);
    await fireEvent.press(screen.getByTestId(`m3g2-option-${rightOf(c).id}`));
    await advance(500);
    expect(api.calls.win).toEqual([c.summary]);
  });

  it('clearing a case advances the rotation', async () => {
    await setup();
    await pass();
    await fireEvent.press(screen.getByTestId(`m3g2-option-${rightOf(HIRING).id}`));
    expect(useGlitchStore.getState().fairnessCases).toBe(0);
    await advance(500);
    expect(useGlitchStore.getState().fairnessCases).toBe(1);
  });

  it('running out of hearts keeps the same case for the retry', async () => {
    const api = await setup();
    await audit();
    await audit();
    await audit();
    expect(api.status).toBe('failed');
    expect(useGlitchStore.getState().fairnessCases).toBe(0);
    expect(caseFor(useGlitchStore.getState().fairnessCases).id).toBe(HIRING.id);
  });

  it('a failed audit on another case records a mistake with no ASK NOVA WHY', async () => {
    const api = await setup('scout', 1);
    await audit();
    expect(api.recorded[0]?.mistake).toMatchObject({ itemId: 'audit', explain: false, itemText: CASES[1]?.auditText });
  });
});

describe('<Fairness Lab> powers on the audit', () => {
  it('X-RAY (SCOUT) fixes the first wrong input in list order and says so', async () => {
    const api = await setup('scout');
    expect(await power(api)).toBe(true);
    expect(checked('code')).toBe(true);
    expect(api.lastSay()).toEqual({ text: 'X-RAY: I fixed Coding test score.', mood: 'good' });
    expect(await power(api)).toBe(true);
    expect(checked('gpa')).toBe(true);
    expect(api.lastSay()?.text).toBe('X-RAY: I fixed GPA.');
    expect(api.powerUses).toBe(0);
  });

  it('X-RAY with everything already correct is not consumed', async () => {
    const api = await setup('scout');
    for (const id of skillsOf(HIRING)) await tog(id);
    expect(await power(api)).toBe(false);
    expect(api.calls.toast).toEqual([NOTHING_TO_USE]);
    expect(api.powerUses).toBe(2);
  });

  it('X-RAY switches off a proxy that is on', async () => {
    const api = await setup('scout');
    for (const id of [...skillsOf(HIRING), 'brk']) await tog(id);
    expect(await power(api)).toBe(true);
    expect(checked('brk')).toBe(false);
    expect(api.lastSay()?.text).toBe('X-RAY: I fixed Career break.');
  });

  it('FOCUS (ORACLE) names a proxy still on, in the case wording, without changing anything', async () => {
    const api = await setup('oracle');
    await tog('cap');
    expect(await power(api)).toBe(true);
    expect(api.lastSay()).toEqual({ text: focusLine("Girls' team captain", HIRING.standsInFor), mood: 'good' });
    expect(checked('cap')).toBe(true);
    expect(api.calls.miss).toHaveLength(0);
    await advance(2200);
  });

  it('FOCUS with no proxy on points at the next skill to switch on', async () => {
    const api = await setup('oracle');
    expect(await power(api)).toBe(true);
    expect(api.lastSay()?.text).toBe('FOCUS: Coding test score really measures this. It should be on.');
    expect(checked('code')).toBe(false);
    await advance(2200);
  });

  it('FOCUS with everything correct is not consumed', async () => {
    const api = await setup('oracle');
    for (const id of skillsOf(HIRING)) await tog(id);
    expect(await power(api)).toBe(false);
    expect(api.powerUses).toBe(2);
  });

  it('SHIELD (GUARDIAN) blocks a failed audit', async () => {
    const api = await setup('guard');
    expect(await power(api)).toBe(true);
    await audit();
    expect(api.hearts).toBe(3);
    expect(api.lastSay()?.text).toBe(`${SHIELDED_PREFIX}${accuracyFailMessage(50)}`);
    await audit();
    expect(api.hearts).toBe(2);
  });

  it('REWIND (CHRONO) restores a heart lost to a failed audit', async () => {
    const api = await setup('chrono');
    await audit();
    expect(await power(api)).toBe(true);
    expect(api.hearts).toBe(3);
    expect(api.lost).toBe(1);
  });
});
