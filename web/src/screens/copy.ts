// All learner-facing shell copy (v3 lines 338–487 + course-shell.md / game-runtime.md /
// spec/ui.md). Screens import these constants so tests can assert the exact strings.
export const WELCOME = {
  title: 'GLITCH',
  subtitle: 'AN AI LITERACY ADVENTURE',
  tagline: 'Spot what AI gets wrong. Pick a hero. Win the game.',
  nicknameLabel: 'Your nickname',
  nicknamePlaceholder: 'Type a nickname',
  start: '▶ Start playing',
  skip: 'Skip',
  foot: 'Saved on this device only. No account needed.',
} as const;

export const HOME = {
  eyebrow: 'WELCOME BACK',
  sub: 'Spot what AI gets wrong. Make the call.',
  levelLabel: (x: number) => `${x}/100 XP to next level`,
  totalXp: 'Total XP',
  streakLabel: (best: number) => `Day streak (best ${best})`,
  modulesLabel: 'Modules complete',
  course: 'COURSE · AI LITERACY',
  courseSub: '4 environments. In each one: pick a hero, watch the story, then play the games. Finish a module to unlock the next.',
  lockedMsg: (prev: number) => `Finish Module ${prev} to unlock this one.`,
  badges: (e: number, t: number) => `BADGES · ${e}/${t}`,
  badgesSub: 'Collect them by playing.',
  unlocked: 'UNLOCKED',
  foot: 'Progress saves on this device.',
  done: 'DONE',
  start: 'START',
  locked: 'LOCKED',
} as const;

export const HERO_SELECT = {
  heading: 'CHOOSE YOUR HERO',
  sub: 'Each hero has one power. You get 2 uses per game.',
  enter: (title: string) => `▶ Enter the ${title}`,
  back: '← HOME',
} as const;

export const GAME = {
  failTitle: 'OUT OF HEARTS',
  failText: 'No problem. Use your hero power, read the clues, and try again.',
  retry: '↻ Try again',
  home: '← Home',
  winTitle: 'LEVEL CLEAR',
  learned: 'WHAT YOU LEARNED',
  continue: 'Continue ▶',
  finishModule: 'Finish module ▶',
  replay: '↻ Replay',
  xpTag: (n: number) => `+${n} XP`,
  flawlessTag: (n: number) => `FLAWLESS +${n}`,
  askNovaWhy: 'ASK NOVA WHY',
  soonStrip: 'COMING SOON: Fresh case files on replay · Mistake recap',
  winAnnounce: (n: number) => `Level clear, ${n} ${n === 1 ? 'star' : 'stars'}`,
  failAnnounce: 'Out of hearts',
} as const;

export const COMPLETE = {
  tag: (n: number) => `MODULE ${n} COMPLETE`,
  courseTitle: 'COURSE COMPLETE!',
  covered: 'You covered:',
  next: "WHAT'S NEXT",
  nextText: (n: number, title: string) => `Module ${n} is unlocked: ${title}.`,
  finished: 'YOU FINISHED GLITCH',
  finishedText: 'You can now spot what AI gets wrong and make the call. Replay any game from the homepage to earn more stars.',
  startNext: (n: number) => `Start Module ${n} ▶`,
  home: '← Home',
} as const;

export const SETTINGS = {
  title: 'SETTINGS',
  nickname: 'NICKNAME',
  nicknameHelp: 'Optional, up to 20 characters. Leave empty to play as PLAYER 1.',
  save: 'Save nickname',
  saved: 'SAVED',
  readable: 'READABLE FONT',
  readableHelp: 'Long text (story, game items, NOVA replies, tips) switches to a plain font at 16 px.',
  privacyTitle: 'PRIVACY',
  privacy: "Everything saves on this device. NOVA's server never keeps what you type.",
  reset: 'Reset progress',
  resetConfirm: 'Tap again to erase XP, badges and progress',
  resetHelp: 'Keeps your streak, nickname and settings.',
} as const;

export const LOCKED = {
  title: 'LOCKED',
  text: 'This step is locked. Finish the earlier steps first.',
  home: '← Home',
} as const;
