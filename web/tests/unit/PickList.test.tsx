// <PickList>: taps, misses, counter, 700 ms done, X-RAY / FOCUS (Fact or Fib shape).
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { PickList } from '@/dnd/PickList';
import type { PickLine } from '@/dnd/pickEngine';
import { createTestGameApi, renderWithProviders } from '@/testing/renderWithProviders';

const lines: PickLine[] = [
  { text: 'Machine learning finds patterns in training data.', isTarget: false },
  { text: 'A model that memorizes its training data will always do well on new data.', isTarget: true, note: 'Memorizing is not generalizing. New data is the real test.' },
  { text: 'NAME', isTarget: null, label: 'NAME' },
  { text: "A model's prediction is always a proven fact.", isTarget: true, note: 'A prediction is an informed guess and it can be wrong.' },
];

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function setup(hero: 'scout' | 'oracle' = 'scout') {
  const api = createTestGameApi({ hero });
  const onDone = jest.fn();
  await renderWithProviders(
    <PickList
      lines={lines}
      api={api}
      paperTag="NOVA · DRAFT ESSAY"
      counterLabel="FIBS FOUND"
      targetTag="FIB"
      safeTag="TRUE"
      foundLine={(l) => `Fib caught! ${l.note ?? ''}`}
      missMessage="That one is actually true. Look for something that sounds too sure."
      focusLine="FOCUS: that one is true. Ignore it."
      onDone={onDone}
    />,
  );
  return { api, onDone };
}

describe('<PickList>', () => {
  it('shows the counter and redacted lines as non-interactive', async () => {
    await setup();
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 0/2');
    expect(screen.getByTestId('pick-line-2')).toHaveTextContent(/NAME: ▮▮▮▮▮▮ REMOVED/);
    expect(screen.getByTestId('pick-line-2').props.accessibilityRole).toBeUndefined();
  });

  it('a target tap marks FIB, shows its note, counts it and says the found line', async () => {
    const { api } = await setup();
    await fireEvent.press(screen.getByTestId('pick-line-1'));
    expect(screen.getByTestId('pick-line-1')).toHaveTextContent(/FIB/);
    expect(screen.getByTestId('pick-line-1')).toHaveTextContent(/Memorizing is not generalizing/);
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 1/2');
    expect(api.lastSay()).toEqual({ text: 'Fib caught! Memorizing is not generalizing. New data is the real test.', mood: 'good' });
  });

  it('a non-target tap marks TRUE, disables the line and misses', async () => {
    const { api } = await setup();
    await fireEvent.press(screen.getByTestId('pick-line-0'));
    expect(screen.getByTestId('pick-line-0')).toHaveTextContent(/TRUE/);
    expect(api.calls.miss).toEqual(['That one is actually true. Look for something that sounds too sure.']);
    expect(screen.getByTestId('pick-line-0').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('fires onDone 700 ms after the last target', async () => {
    const { onDone } = await setup();
    await fireEvent.press(screen.getByTestId('pick-line-1'));
    await fireEvent.press(screen.getByTestId('pick-line-3'));
    await act(async () => {
      jest.advanceTimersByTime(699);
    });
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('X-RAY (SCOUT) catches the next fib', async () => {
    const { api } = await setup('scout');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(screen.getByTestId('pick-found')).toHaveTextContent('FIBS FOUND: 1/2');
    expect(screen.getByTestId('pick-line-1')).toHaveTextContent(/FIB/);
  });

  it('FOCUS (ORACLE) marks the next true line safe with no heart cost', async () => {
    const { api } = await setup('oracle');
    await act(async () => {
      expect(api.usePower()).toBe(true);
    });
    expect(screen.getByTestId('pick-line-0')).toHaveTextContent(/TRUE/);
    expect(api.lastSay()?.text).toBe('FOCUS: that one is true. Ignore it.');
    expect(api.hearts).toBe(3);
    expect(api.calls.miss).toHaveLength(0);
  });
});

describe('<PickList> Phase 3 mistake plumbing', () => {
  it('passes mistakeFor(line, index) as the second miss argument for a non-target tap only', async () => {
    const api = createTestGameApi({ powerUses: 4 });
    const mistakeFor = jest.fn((l: PickLine, i: number) => ({
      itemId: `s${i}`, answer: 'fib', correct: 'true', concept: 'Machine learning' as const, itemText: l.text, answerLabel: 'FIB', correctLabel: 'TRUE',
    }));
    await renderWithProviders(
      <PickList
        lines={lines}
        api={api}
        paperTag="P"
        counterLabel="FIBS FOUND"
        targetTag="FIB"
        safeTag="TRUE"
        foundLine={() => 'found'}
        missMessage="miss"
        focusLine="focus"
        onDone={jest.fn()}
        mistakeFor={mistakeFor}
      />,
    );
    await act(async () => {
      api.usePower('scan'); // X-RAY: catches line 1
      api.usePower('hint'); // FOCUS: marks line 0 safe
    });
    expect(mistakeFor).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('pick-line-2')); // redacted: inert
    await fireEvent.press(screen.getByTestId('pick-line-3')); // target: found
    expect(api.recorded).toEqual([]);
    expect(mistakeFor).not.toHaveBeenCalled();
  });

  it('a non-target tap records the payload built from that line and index', async () => {
    const api = createTestGameApi();
    await renderWithProviders(
      <PickList
        lines={lines}
        api={api}
        paperTag="P"
        counterLabel="FIBS FOUND"
        targetTag="FIB"
        safeTag="TRUE"
        foundLine={() => 'found'}
        missMessage="miss"
        focusLine="focus"
        onDone={jest.fn()}
        mistakeFor={(l, i) => ({ itemId: `s${i}`, answer: 'fib', correct: 'true', concept: 'Machine learning', itemText: l.text, answerLabel: 'FIB', correctLabel: 'TRUE' })}
      />,
    );
    await fireEvent.press(screen.getByTestId('pick-line-0'));
    expect(api.calls.miss).toEqual(['miss']);
    expect(api.recorded).toEqual([
      { shielded: false, mistake: { itemId: 's0', answer: 'fib', correct: 'true', concept: 'Machine learning', itemText: lines[0]!.text, answerLabel: 'FIB', correctLabel: 'TRUE' } },
    ]);
  });

  it('without mistakeFor the miss carries no payload', async () => {
    const { api } = await setup();
    await fireEvent.press(screen.getByTestId('pick-line-0'));
    expect(api.calls.mistakes).toEqual([undefined]);
    expect(api.recorded).toEqual([]);
  });
});
