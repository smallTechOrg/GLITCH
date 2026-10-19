// SCAFFOLD STUB — slice A2 replaces this file with the faithful port of v3 `drawChar` /
// `drawNova` (spec/GLITCH v3.html lines 224–245) plus idle/blink/talk/think frames.
// The stub returns correctly sized silhouettes in each character's colours so every
// screen renders before A2 lands. Signature is the frozen contract (contracts/art.ts).
import type { CharacterId } from '../contracts/ids';
import { CHAR_H, CHAR_W, NOVA_H, type CharFrame, type FrameBuffer } from '../contracts/art';
import { createFrameBuffer } from '../pixel/framebuffer';
import { part, rc } from '../pixel/primitives';
import { characterLook } from '../content/heroes';

/**
 * Draw one character frame. 24×32 for people, 24×28 for NOVA ('n').
 * `tick` (0..2) selects the step of animated frames such as NOVA 'think'.
 */
export function drawCharacter(id: CharacterId, frame: CharFrame = 'idle', tick = 0): FrameBuffer {
  void tick;
  const isNova = id === 'n';
  const fb = createFrameBuffer(CHAR_W, isNova ? NOVA_H : CHAR_H);
  const look = characterLook(id);
  if (isNova || !look) {
    part(fb, 5, 7, 14, 11, '#d7defa');
    part(fb, 8, 19, 8, 6, '#9aa0c8');
    rc(fb, 8, 11, 3, frame === 'blink' ? 1 : 3, '#5eead4');
    rc(fb, 13, 11, 3, frame === 'blink' ? 1 : 3, '#5eead4');
    return fb;
  }
  part(fb, 6, 14, 12, 10, look.top);
  part(fb, 8, 23, 3, 6, look.bot);
  part(fb, 13, 23, 3, 6, look.bot);
  part(fb, 7, 3, 10, 10, look.skin);
  part(fb, 6, 2, 12, 3, look.hair);
  rc(fb, 9, 8, 2, frame === 'blink' ? 1 : 2, '#16122b');
  rc(fb, 13, 8, 2, frame === 'blink' ? 1 : 2, '#16122b');
  if (frame === 'talk') rc(fb, 11, 11, 2, 2, '#8a3b3b');
  return fb;
}
