// Narrow-screen rendering (spec/ui.md → Responsive: no horizontal scroll at 320 px).
import React from 'react';
import { screen } from '@testing-library/react-native';
import { PixelButton } from '@/ui/PixelButton';
import { castScale } from '@/theme/responsive';
import { renderWithProviders } from '@/testing/renderWithProviders';

describe('PixelButton iconOnly', () => {
  it('drops the visible label but keeps it as the accessibility label', async () => {
    await renderWithProviders(<PixelButton testID="b" label="SETTINGS" icon="gear" iconOnly />);
    expect(screen.queryByText('SETTINGS')).toBeNull();
    expect(screen.getByLabelText('SETTINGS')).toBeTruthy();
  });

  it('shows the label when not icon-only, or when there is no icon to show', async () => {
    await renderWithProviders(
      <>
        <PixelButton label="WITH LABEL" icon="gear" />
        <PixelButton label="NO ICON" iconOnly />
      </>,
    );
    expect(screen.getByText('WITH LABEL')).toBeTruthy();
    expect(screen.getByText('NO ICON')).toBeTruthy();
  });
});

describe('Welcome cast scale', () => {
  it('shrinks the four 24 px sprites so they fit a 320 px banner', () => {
    expect(castScale(320)).toBe(2);
    expect(castScale(399)).toBe(2);
    expect(castScale(400)).toBe(3);
    expect(castScale(640)).toBe(3);
    expect(castScale(641)).toBe(4);
    // 4 sprites × 24 px × scale + 3 gaps of 12 px must fit 320 − 2×14 padding − 2×3 border.
    expect(4 * 24 * castScale(320) + 3 * 12).toBeLessThanOrEqual(320 - 28 - 6);
  });
});
