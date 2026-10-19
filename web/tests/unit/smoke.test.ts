// Scaffold smoke: every frozen contract is wired and consistent.
import { GAME_IDS, MODULE_IDS, STEP_IDS, moduleOfGame, parseGameId, parseModuleId } from '@/contracts/ids';
import { GAMES } from '@/games/registry';
import { GAME_META, MODULES, gameParams, isGameOfModule, moduleParams, stepsOf } from '@/content/modules';
import { HEROES, NPCS, POWER_ICON } from '@/content/heroes';
import { stepHref, showsTopBar } from '@/contracts/routes';
import { FreeWriteRound } from '@/features/freewrite/FreeWriteRound';
import { STATE_STORAGE_KEY, DEVICE_STORAGE_KEY, displayName } from '@/contracts/state';

describe('scaffold smoke', () => {
  it('registers all nine games with the module they belong to', () => {
    expect(Object.keys(GAMES).sort()).toEqual([...GAME_IDS].sort());
    for (const id of GAME_IDS) {
      const g = GAMES[id];
      expect(g.id).toBe(id);
      expect(g.module).toBe(moduleOfGame(id));
      expect(isGameOfModule(g.module, id)).toBe(true);
      expect(g.title).toBe(GAME_META[id].title);
      expect(typeof g.Component).toBe('function');
    }
  });

  it('has the four v3 modules with 2/2/2/3 games and 17 steps in total', () => {
    expect(MODULES.map((m) => m.games.length)).toEqual([2, 2, 2, 3]);
    expect(MODULES.map((m) => m.title)).toEqual(['Training Lab', 'Prompt Forge', 'Neon City', 'The Newsroom']);
    expect(MODULE_IDS.flatMap((m) => stepsOf(m).map((s) => s.id))).toEqual(STEP_IDS);
    expect(stepsOf(1).map((s) => [s.kind, s.label])).toEqual([
      ['HERO', 'Choose your hero'], ['STORY', 'Storytime'], ['GAME', 'Train the Model'], ['GAME', 'Fact or Fib'],
    ]);
  });

  it('pre-renders every module route and only each module’s own games', () => {
    expect(moduleParams()).toHaveLength(4);
    expect(gameParams()).toEqual(GAME_IDS.map((g) => ({ mod: g.charAt(1), game: g })));
    expect(isGameOfModule(1, 'm2g1')).toBe(false);
  });

  it('parses route params defensively', () => {
    expect(parseModuleId('3')).toBe(3);
    expect(parseModuleId(['2'])).toBe(2);
    expect(parseModuleId('5')).toBeNull();
    expect(parseModuleId('1x')).toBeNull();
    expect(parseGameId('m4g3')).toBe('m4g3');
    expect(parseGameId('m4g4')).toBeNull();
  });

  it('maps step ids to app-relative hrefs and hides the top bar on welcome and story', () => {
    expect(stepHref('m1h')).toBe('/module/1/hero');
    expect(stepHref('m3s')).toBe('/module/3/story');
    expect(stepHref('m4g2')).toBe('/module/4/game/m4g2');
    expect(showsTopBar(['welcome'])).toBe(false);
    expect(showsTopBar(['module', '[mod]', 'story'])).toBe(false);
    expect(showsTopBar(['module', '[mod]', 'game', '[game]'])).toBe(true);
    expect(showsTopBar([])).toBe(true);
  });

  it('carries v3 hero powers and NPC names', () => {
    expect(Object.values(HEROES).map((h) => [h.name, h.powerName])).toEqual([
      ['SCOUT', 'X-RAY'], ['CHRONO', 'REWIND'], ['GUARDIAN', 'SHIELD'], ['ORACLE', 'FOCUS'],
    ]);
    expect(NPCS.d.name).toBe("MS. D'SOUZA");
    expect(POWER_ICON.hint).toBe('target');
  });

  it('exposes the free-write round stub and the storage keys from spec/data.md', () => {
    expect(typeof FreeWriteRound).toBe('function');
    expect(STATE_STORAGE_KEY).toBe('glitch.v1.state');
    expect(DEVICE_STORAGE_KEY).toBe('glitch.v1.device');
    expect(displayName(null)).toBe('PLAYER 1');
    expect(displayName('  Ana ')).toBe('Ana');
  });
});
