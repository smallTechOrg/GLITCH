// spaceActivates: Space toggles switches/radios on web; holding Space (key repeat) must not
// re-toggle, and Space never scrolls the page.
import { Platform } from 'react-native';
import { spaceActivates } from '../../src/a11y/spaceActivates';

type Handlers = { onKeyDown?: (e: { nativeEvent: { key: string; repeat?: boolean }; preventDefault?: () => void }) => void };

function onWeb(): void {
  jest.replaceProperty(Platform, 'OS', 'web');
}

afterEach(() => jest.restoreAllMocks());

describe('spaceActivates', () => {
  it('activates once on Space and prevents page scroll', () => {
    onWeb();
    const fn = jest.fn();
    const prevent = jest.fn();
    const h = spaceActivates(fn) as Handlers;
    h.onKeyDown?.({ nativeEvent: { key: ' ' }, preventDefault: prevent });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(prevent).toHaveBeenCalledTimes(1);
  });

  it('ignores auto-repeat keydowns while Space is held (still no scroll)', () => {
    onWeb();
    const fn = jest.fn();
    const prevent = jest.fn();
    const h = spaceActivates(fn) as Handlers;
    h.onKeyDown?.({ nativeEvent: { key: ' ', repeat: false }, preventDefault: prevent });
    for (let i = 0; i < 5; i++) h.onKeyDown?.({ nativeEvent: { key: ' ', repeat: true }, preventDefault: prevent });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(prevent).toHaveBeenCalledTimes(6);
  });

  it('does nothing when disabled, for other keys, or off web', () => {
    onWeb();
    const fn = jest.fn();
    (spaceActivates(fn, true) as Handlers).onKeyDown?.({ nativeEvent: { key: ' ' } });
    (spaceActivates(fn) as Handlers).onKeyDown?.({ nativeEvent: { key: 'a' } });
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(spaceActivates(fn)).toEqual({});
    expect(fn).not.toHaveBeenCalled();
  });
});
