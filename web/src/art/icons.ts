// v3 12×12 pixel icons — copied verbatim from spec/GLITCH v3.html lines 163–204 (`IC`),
// plus heart0/star0 derived exactly as v3 lines 205–206. Generated; do not hand-edit grids.
const BASE = {
  heart: ['............', '..kk....kk..', '.krrk..krrrk', 'krwrrkkrrrrk', 'krwrrrrrrrrk', 'krrrrrrrrrRk', '.krrrrrrrRk.', '..krrrrrRk..', '...krrrRk...', '....krRk....', '.....kk.....', '............'],
  star: ['............', '.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyywyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyykk.kkyyk', '.kkk.....kkk'],
  lock: ['............', '...kkkkkk...', '..kggggggk..', '..kg....gk..', '..kg....gk..', '.kkkkkkkkkk.', '.kyyyyyyyyk.', '.kyyyykkyyk.', '.kyyyykkyyk.', '.kyyyyyyyyk.', '.kkkkkkkkkk.', '............'],
  check: ['............', '..........kk', '.........kek', '........keek', 'kk.....keek.', 'kek...keek..', 'keek.keek...', '.keekeek....', '..keeek.....', '...kek......', '....k.......', '............'],
  cross: ['............', 'kk........kk', 'krk......krk', 'krrk....krrk', '.krrk..krrk.', '..krrkkrrk..', '...krrrrk...', '..krrkkrrk..', '.krrk..krrk.', 'krrk....krrk', 'krk......krk', 'kk........kk'],
  flame: ['............', '......kk....', '.....kook...', '.....koyk...', '....kooyk...', '...kkooyok..', '..kooyyyook.', '..kooywyyok.', '..koyywwyok.', '..koyyyyyok.', '...kooyyok..', '....kkkk....'],
  shield: ['............', '.kkkkkkkkkk.', '.kbbbbBBBBk.', '.kbwbbBBBBk.', '.kbwbbBBBBk.', '.kbbbbBBBBk.', '.kbbbbBBBBk.', '..kbbbBBBk..', '..kbbbBBBk..', '...kbbBBk...', '....kbBk....', '.....kk.....'],
  scan: ['............', '...kkkkk....', '..kbbwbbk...', '.kbwbbbbbk..', '.kbbbbbbbk..', '.kbbbbbbbk..', '..kbbbbbkk..', '...kkkkkgkk.', '........kgkk', '.........kgk', '..........kk', '............'],
  rewind: ['............', '............', '...kk...kk..', '..kyk..kyk..', '.kyyk.kyyk..', 'kyyyykyyyyk.', 'kyyyykyyyyk.', '.kyyk.kyyk..', '..kyk..kyk..', '...kk...kk..', '............', '............'],
  target: ['............', '....kkkk....', '..kkrrrrkk..', '.krrwwwwrrk.', '.krwkkkkwrk.', 'krwkrrrrkwrk', 'krwkrkkrkwrk', 'krwkrrrrkwrk', '.krwkkkkwrk.', '.krrwwwwrrk.', '..kkrrrrkk..', '....kkkk....'],
  bolt: ['............', '......kkk...', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyyyyk...', '..kkkyyk....', '....kyyk....', '....kyk.....', '...kyk......', '...kk.......', '............'],
  trophy: ['............', '.kkkkkkkkkk.', 'kyykyyyykyyk', 'kyykyyyykyyk', '.kkkyyyykkk.', '...kyywyk...', '...kyyyyk...', '....kyyk....', '....kyyk....', '...kkkkkk...', '..kYYYYYYk..', '..kkkkkkkk..'],
  plug: ['............', '..k......k..', '..ky....yk..', '..ky....yk..', '.kkkkkkkkkk.', '.kggggggggk.', '.kggggggggk.', '..kggggggk..', '...kggggk...', '....kggk....', '....kggk....', '.....kk.....'],
  book: ['............', 'kkkkkkkkkkk.', 'kBBBBBBBBBk.', 'kBwwwwwwBBk.', 'kBBBBBBBBBk.', 'kBwwwwwBBBk.', 'kBBBBBBBBBk.', 'kBBBBBBBBBk.', 'kkkkkkkkkkk.', 'kwwwwwwwwwk.', '.kkkkkkkkk..', '............'],
  eye: ['............', '............', '...kkkkkk...', '..kwwwwwwk..', '.kwwkbbkwwk.', 'kwwkbkkbkwwk', 'kwwkbkkbkwwk', '.kwwkbbkwwk.', '..kwwwwwwk..', '...kkkkkk...', '............', '............'],
  flask: ['............', '....kkkk....', '....kggk....', '....kggk....', '....kwwk....', '...kwwwwk...', '..kwwwwwwk..', '.kwcccccwwk.', '.kccceccccck', '.kcceeeeccck', '..kkkkkkkk..', '............'],
  scales: ['............', '.....kk.....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', '.ky..kk..yk.', '.ky..kk..yk.', 'kyyk.kk.kyyk', 'kyyk.kk.kyyk', 'kkkk.kk.kkkk', '....kyyk....', '...kkkkkk...', '............'],
  burst: ['............', 'k....kk....k', '.kk..kk..kk.', '..kkkrrkkk..', 'kkkrryyrrkkk', 'krryyyyyyrrk', 'krryyyyyyrrk', 'kkkrryyrrkkk', '..kkkrrkkk..', '.kk..kk..kk.', 'k....kk....k', '............'],
  cap: ['............', '............', '....kkkk....', '..kkppppkk..', 'kkppppppppkk', '.kkppppppkk.', '...kPPPPk...', '...kPPPPk...', '....kkkk....', '..........y.', '.........yy.', '.........yy.'],
  anchor: ['............', '....kkkk....', '....kggk....', '....kkkk....', '...kkggkk...', '....kggk....', 'kk..kggk..kk', 'kgk.kggk.kgk', '.kgkkggkkgk.', '..kggggggk..', '...kkkkkk...', '............'],
  mask: ['............', '............', '.kkkkkkkkkk.', 'kvvvvvvvvvvk', 'kvkkvvvvkkvk', 'kvkwvvvvwkvk', 'kvvvvvvvvvvk', '.kvvvkkvvvk.', '..kvvvvvvk..', '...kkkkkk...', '............', '............'],
  envelope: ['............', '............', 'kkkkkkkkkkkk', 'kwwwwwwwwwwk', 'kwkwwwwwwkwk', 'kwwkwwwwkwwk', 'kwwwkkkkwwwk', 'kwwkwwwwkwwk', 'kwkwwwwwwkwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk', '............'],
  doc: ['............', '..kkkkkkk...', '..kwwwwwkk..', '..kwbbbwwwk.', '..kwwwwwwwk.', '..kwbbbbbwk.', '..kwwwwwwwk.', '..kwbbbbwwk.', '..kwwwwwwwk.', '..kwbbbwwwk.', '..kkkkkkkkk.', '............'],
  robot: ['............', '....kr......', '....kk......', '..kkkkkkkk..', '..kgggggggk.', '.kkkccckccck', '.kkkcckkcckk', '..kgggggggk.', '..kkkkkkkk..', '...kggggk...', '...kkkkkk...', '............'],
  bubble: ['............', '.kkkkkkkkkk.', 'kwwwwwwwwwwk', 'kwkwwkwwkwwk', 'kwwwwwwwwwwk', '.kkkkkkkkkk.', '...kwk......', '....kk......', '............', '............', '............', '............'],
  bin: ['............', '..kkkkkkkk..', '.kkkkkkkkkk.', '..kggggggk..', '..kgGgGgGk..', '..kggggggk..', '..kgGgGgGk..', '..kggggggk..', '..kgGgGgGk..', '..kggggggk..', '...kkkkkk...', '............'],
  question: ['............', '...kkkkkk...', '..kbbbbbbk..', '.kbbkkkkbbk.', '.kbbk..kbbk.', '......kbbk..', '....kbbk....', '...kbbk.....', '...kbbk.....', '............', '...kbbk.....', '...kkkk.....'],
  warning: ['............', '.....kk.....', '....kyyk....', '....kyyk....', '...kykkyk...', '...kykkyk...', '..kyykkyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyyykkyyyk.', 'kyyyyyyyyyyk', 'kkkkkkkkkkkk'],
  clock: ['............', '...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', '.kwwwkwwwwk.', '.kwwwkkkwwk.', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...', '............', '............', '............'],
  globe: ['............', '...kkkkkk...', '..kbbeebbk..', '.kbeeebbbbk.', '.kbeebbeebk.', '.kbbbbeeebk.', '.kbbeebbbbk.', '.kbbeeebbbk.', '..kbbbbbbk..', '...kkkkkk...', '............', '............'],
  phone: ['..kkkkkkkk..', '..kddddddk..', '..kdbbbbdk..', '..kdbwwbdk..', '..kdbbbbdk..', '..kdbwwbdk..', '..kdbbbbdk..', '..kddddddk..', '..kdkkkkdk..', '..kddddddk..', '..kkkkkkkk..', '............'],
  pin: ['............', '....kkkk....', '...krrrrk...', '..krrwrrrk..', '..krwkkrrk..', '..krrkkrrk..', '...krrrrk...', '....krrk....', '.....kk.....', '............', '............', '............'],
  mic: ['............', '....kkkk....', '...kppppk...', '...kpwppk...', '...kppppk...', '...kpwppk...', '.k.kppppk.k.', '.kkkppppkkk.', '..kkkkkkkk..', '....kppk....', '...kkkkkk...', '............'],
  tv: ['............', '...k....k...', '....k..k....', '..kkkkkkkk..', '.kdbbbbbbdk.', '.kdbbwwbbdk.', '.kdbbbbbbdk.', '.kddddddddk.', '..kkkkkkkk..', '............', '............', '............'],
  car: ['............', '............', '....kkkkk...', '...kbbwwbk..', '..kbbwwbbbk.', '.kkkkkkkkkkk', 'kbbbbbbbbbbk', 'kbbyybbbbyyk', 'kkkkkkkkkkkk', '.kgkk..kkgk.', '..kk....kk..', '............'],
  chip: ['............', '..k.k.k.k...', '..kkkkkkkk..', 'kkkEEEEEEkkk', '..kEcccceEk.', 'kkkEcEEcEkkk', '..kEcEEcEEk.', 'kkkEcccceEkk', '..kEEEEEEEk.', '..kkkkkkkk..', '..k.k.k.k...', '............'],
  camera: ['............', '............', '...kkkk.....', '.kkkkkkkkkk.', 'kgggggggggk.', 'kgkkkkkkkgk.', 'kgkwbbbkkgk.', 'kgkbbbwkkgk.', 'kgkkkkkkkgk.', 'kgggggggggk.', '.kkkkkkkkkk.', '............'],
  gear: ['............', '....kkkk....', '.kk.kggk.kk.', 'kggkkggkkggk', '.kggggggggk.', '..kgkkkkgk..', 'kggkk..kkggk', 'kggkk..kkggk', '..kgkkkkgk..', '.kggggggggk.', 'kggkkggkkggk', '.kk.kggk.kk.'],
  key: ['............', '..kkkk......', '.kyyyyk.....', 'kyy..yyk....', 'kyy..yykkkkk', 'kyyyyyyyyyyk', '.kyyyk.kk.yk', '..kkk..kk.kk', '.......kk...', '............', '............', '............'],
  medal: ['............', '..kbk.kbk...', '..kbbkbbk...', '...kbbbk....', '...kkkkk....', '..kyyyyyk...', '.kyywwyyyk..', '.kyywyyyyk..', '.kyyyyyyyk..', '..kyyyyyk...', '...kkkkk....', '............'],
} as const;

/** v3: heart0 = heart with w→G and r/R→d; star0 = star with w→G and y/Y→d. */
export const deriveEmpty = (g: readonly string[], from: RegExp): string[] => g.map((r) => r.replace(/w/g, 'G').replace(from, 'd'));

export const IC = {
  ...BASE,
  heart0: deriveEmpty(BASE.heart, /[rR]/g),
  star0: deriveEmpty(BASE.star, /[yY]/g),
} as const satisfies Record<string, readonly string[]>;

export const V3_ICON_COUNT = 40;
