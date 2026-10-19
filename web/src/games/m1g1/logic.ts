// m1g1 · Train the Model — pure builders for the two sort steps (v3 lines 504–511).
import type { SortConfig, SortItem } from '../../dnd/sortEngine';
import {
  ITEM_ICON, MODEL_SAYS_PREFIX, STEP1_WRONG, STEP2_WRONG, TEST_EMAILS, TEST_ZONES, TRAIN_EMAILS, TRAIN_ZONES,
  type TestEmail, type TrainEmail,
} from './data';

export type Step = 'train' | 'test' | 'result';

export interface TrainItem extends SortItem {
  /** The email text as shown. */
  email: string;
  /** Step 2 only: the model's verdict ("SPAM" / "NOT SPAM"). */
  says?: string;
}

/** v3: a = e[2]==="s" ? "spam" : "ok". */
export function trainAnswer(e: TrainEmail): 'spam' | 'ok' {
  return e[2] === 's' ? 'spam' : 'ok';
}

/** v3: a = e[3]==="r" ? "right" : "wrong". */
export function testAnswer(e: TestEmail): 'right' | 'wrong' {
  return e[3] === 'r' ? 'right' : 'wrong';
}

/** "MODEL SAYS: SPAM". */
export function modelSays(e: TestEmail): string {
  return MODEL_SAYS_PREFIX + e[2];
}

export function trainingConfig(): SortConfig<TrainItem> {
  return {
    items: TRAIN_EMAILS.map((e) => ({ id: e[0], answer: trainAnswer(e), text: e[1], email: e[1], icon: ITEM_ICON })),
    zones: TRAIN_ZONES,
    wrong: () => STEP1_WRONG,
  };
}

export function testConfig(): SortConfig<TrainItem> {
  return {
    // `text` (used for screen-reader labels and announcements) carries the model's verdict too.
    items: TEST_EMAILS.map((e) => ({ id: e[0], answer: testAnswer(e), text: `${e[1]}. ${modelSays(e)}`, email: e[1], says: modelSays(e), icon: ITEM_ICON })),
    zones: TEST_ZONES,
    wrong: () => STEP2_WRONG,
  };
}

/** Step order: train → test → result. */
export function nextStep(s: Step): Step {
  return s === 'train' ? 'test' : 'result';
}
