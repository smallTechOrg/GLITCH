// Shared UI primitives: slider keys/buttons, toast queue timing, energy meter, metric rule, stepped easing.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slider, clampStep, sliderKeyValue, valueAtX } from '@/ui/Slider';
import { EnergyMeter, energyLabel, hoursUntil } from '@/ui/EnergyMeter';
import { MetricBar, metricOk } from '@/ui/MetricBar';
import { ToggleTile } from '@/ui/ToggleTile';
import { ToastHost } from '@/ui/ToastHost';
import { TOAST_MS, resetToasts, toast, useToastStore } from '@/ui/toast';
import { steps } from '@/a11y/stepped';
import { renderWithProviders } from '@/testing/renderWithProviders';

describe('Slider', () => {
  it('maps keys exactly: arrows ±1, PageUp/Down ±10, Home/End, others null', () => {
    expect(sliderKeyValue('ArrowRight', 50, 0, 100)).toBe(51);
    expect(sliderKeyValue('ArrowLeft', 0, 0, 100)).toBe(0);
    expect(sliderKeyValue('PageUp', 95, 0, 100)).toBe(100);
    expect(sliderKeyValue('PageDown', 30, 0, 40)).toBe(20);
    expect(sliderKeyValue('Home', 30, 0, 40)).toBe(0);
    expect(sliderKeyValue('End', 30, 0, 40)).toBe(40);
    expect(sliderKeyValue('a', 30, 0, 40)).toBeNull();
  });

  it('clamps/snaps values and maps track x to a value', () => {
    expect(clampStep(41.4, 0, 40)).toBe(40);
    expect(clampStep(12.6, 0, 40)).toBe(13);
    expect(valueAtX(50, 200, 0, 100)).toBe(25);
    expect(valueAtX(-10, 200, 0, 100)).toBe(0);
  });

  it('− / + buttons change the value by one step and expose adjustable semantics', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Slider id="th" label="THRESHOLD" value={50} min={0} max={100} onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('slider-th-inc'));
    await fireEvent.press(screen.getByTestId('slider-th-dec'));
    expect(onChange.mock.calls).toEqual([[51], [49]]);
    const s = screen.getByTestId('slider-th');
    expect(s.props.accessibilityRole).toBe('adjustable');
    expect(s.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    expect(screen.getByTestId('slider-th-value')).toHaveTextContent('50');
  });

  it('screen-reader increment/decrement actions step the value', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Slider id="wc" label="ALL-CAPS WEIGHT" value={30} min={0} max={40} onChange={onChange} />);
    await fireEvent(screen.getByTestId('slider-wc'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(31);
  });

  it('disables − at min and + at max', async () => {
    await renderWithProviders(<Slider id="en" label="ENGAGEMENT PUSH" value={0} min={0} max={0} onChange={jest.fn()} />);
    expect(screen.getByTestId('slider-en-dec').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('slider-en-inc').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('toasts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetToasts();
  });
  afterEach(() => jest.useRealTimers());

  it('shows one toast at a time for 2.3 s each, in order', async () => {
    await renderWithProviders(<ToastHost />);
    await act(async () => {
      toast('+10 XP · DAILY x1');
      toast('LEVEL UP! LVL 2');
    });
    expect(screen.getByTestId('toast')).toHaveTextContent('+10 XP · DAILY x1');
    await act(async () => {
      jest.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.getByTestId('toast')).toHaveTextContent('LEVEL UP! LVL 2');
    await act(async () => {
      jest.advanceTimersByTime(TOAST_MS);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(useToastStore.getState().queue).toEqual([]);
  });
});

describe('EnergyMeter', () => {
  it('labels ok / loading / offline states for screen readers', async () => {
    expect(energyLabel({ kind: 'ok', remaining: 9, limit: 10, resetsAt: '' })).toBe('AI energy 9 of 10');
    expect(energyLabel({ kind: 'offline' })).toMatch(/unknown/);
    await renderWithProviders(<EnergyMeter state={{ kind: 'offline' }} />);
    expect(screen.getByTestId('fw-energy')).toHaveTextContent(/\?/);
  });

  it('shows the recharge time when flat', async () => {
    const now = new Date('2026-10-19T21:10:00Z');
    expect(hoursUntil('2026-10-20T00:00:00Z', now)).toBe(3);
    await renderWithProviders(<EnergyMeter now={now} state={{ kind: 'ok', remaining: 0, limit: 10, resetsAt: '2026-10-20T00:00:00Z' }} />);
    expect(screen.getByTestId('fw-energy')).toHaveTextContent(/RECHARGES IN 3H/);
    expect(screen.getByTestId('fw-energy').props.accessibilityLabel).toBe('AI energy 0 of 10');
  });
});

describe('MetricBar, ToggleTile', () => {
  it('applies the v3 metric rule on unrounded values', async () => {
    expect(metricOk(65, 65, 1)).toBe(true);
    expect(metricOk(64.99, 65, 1)).toBe(false);
    expect(metricOk(35, 35, -1)).toBe(true);
    await renderWithProviders(<MetricBar id="k2" label="WELLBEING" value={23} target={65} direction={1} icon="heart" />);
    expect(screen.getByTestId('metric-k2').props.accessibilityLabel).toBe('WELLBEING 23%, goal ≥65, not met');
  });

  it('toggle exposes switch semantics and an ON/OFF text tag', async () => {
    const onToggle = jest.fn();
    await renderWithProviders(<ToggleTile id="code" label="Coding test score" on onToggle={onToggle} />);
    const t = screen.getByTestId('toggle-code');
    expect(t.props.accessibilityRole).toBe('switch');
    expect(t.props.accessibilityState).toMatchObject({ checked: true });
    expect(t).toHaveTextContent(/ON/);
    await fireEvent.press(t);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('stepped easing', () => {
  it('matches CSS steps(n, end)', () => {
    const s4 = steps(4);
    expect([0, 0.24, 0.25, 0.6, 0.99, 1].map(s4)).toEqual([0, 0, 0.25, 0.5, 0.75, 1]);
    expect(steps(0)(0.5)).toBe(0);
  });
});
