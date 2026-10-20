// <MistakeRecap> rendering (spec/ui.md → Recap test IDs + a11y; mistake-recap.md).
import React from 'react';
import { screen } from '@testing-library/react-native';
import { MistakeRecap } from '@/features/recap/MistakeRecap';
import { renderWithProviders } from '@/testing/renderWithProviders';
import { sm } from './fixtures';

describe('<MistakeRecap>', () => {
  it('clean run → heading + "No mistakes. Clean run!" and no rows', async () => {
    await renderWithProviders(<MistakeRecap mistakes={[]} explanations={{}} />);
    expect(screen.getByTestId('recap')).toHaveTextContent(/MISTAKE RECAP/);
    expect(screen.getByTestId('recap-clean')).toHaveTextContent('No mistakes. Clean run!');
    expect(screen.queryByTestId('recap-row-0')).toBeNull();
    expect(screen.queryByTestId('recap-more')).toBeNull();
  });

  it('a row shows item, YOU SAID, IT WAS, why, as one labelled group', async () => {
    await renderWithProviders(<MistakeRecap mistakes={[sm(1)]} explanations={{}} />);
    expect(screen.queryByTestId('recap-clean')).toBeNull();
    expect(screen.getByTestId('recap-item-0')).toHaveTextContent('Email 1');
    expect(screen.getByTestId('recap-said-0')).toHaveTextContent('YOU SAID: NOT SPAM');
    expect(screen.getByTestId('recap-was-0')).toHaveTextContent('IT WAS: SPAM');
    expect(screen.getByTestId('recap-why-0')).toHaveTextContent('Canned 1.');
    const row = screen.getByTestId('recap-row-0');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe('Email 1. You said NOT SPAM. It was SPAM. Canned 1.');
    expect(screen.queryByTestId('recap-count-0')).toBeNull();
    expect(screen.queryByTestId('recap-shielded-0')).toBeNull();
  });

  it('six mistakes with one repeat → ×2 on the repeated row, 5 rows and "+1 more"', async () => {
    const ms = [sm(1), sm(2), sm(1), sm(3), sm(4), sm(5), sm(6)];
    await renderWithProviders(<MistakeRecap mistakes={ms} explanations={{}} />);
    expect(screen.getByTestId('recap-count-0')).toHaveTextContent('×2');
    expect(screen.queryByTestId('recap-count-1')).toBeNull();
    expect(screen.getByTestId('recap-row-4')).toBeTruthy();
    expect(screen.queryByTestId('recap-row-5')).toBeNull();
    expect(screen.getByTestId('recap-more')).toHaveTextContent('+1 more');
  });

  it('a fetched explanation replaces the canned why for its row only', async () => {
    await renderWithProviders(<MistakeRecap mistakes={[sm(1), sm(2)]} explanations={{ 'e1|ok': { text: 'Prizes shout SPAM.', tip: 'Look for prizes.' } }} />);
    expect(screen.getByTestId('recap-why-0')).toHaveTextContent('Prizes shout SPAM.');
    expect(screen.getByTestId('recap-why-1')).toHaveTextContent('Canned 2.');
    expect(screen.getByTestId('recap-row-0').props.accessibilityLabel).toBe('Email 1. You said NOT SPAM. It was SPAM. Prizes shout SPAM.');
  });

  it('a shielded mistake carries the SHIELDED tag', async () => {
    await renderWithProviders(<MistakeRecap mistakes={[sm(1, { shielded: true }), sm(2)]} explanations={{}} />);
    expect(screen.getByTestId('recap-shielded-0')).toHaveTextContent('SHIELDED');
    expect(screen.queryByTestId('recap-shielded-1')).toBeNull();
  });

  it('never touches the network', async () => {
    const f = jest.fn();
    const g = globalThis as { fetch?: unknown };
    const prev = g.fetch;
    g.fetch = f;
    try {
      await renderWithProviders(<MistakeRecap mistakes={[sm(1), sm(2)]} explanations={{}} />);
      expect(f).not.toHaveBeenCalled();
    } finally {
      g.fetch = prev;
    }
  });
});
