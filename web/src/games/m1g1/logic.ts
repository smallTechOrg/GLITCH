// m1g1 · Train the Model — pure rules. Each round: the player calls every email, then verifies.
import type { Mistake } from '../../contracts/game';
import { buildMistake } from '../mistake';
import { ROUND1_WRONG, ROUND2_WRONG, V3_SCENARIO, ZONES, type TestEmail, type TrainEmail, type TrainScenario } from './data';

export type Step = 'train' | 'test' | 'result';
export type Call = 'spam' | 'ok';

export interface EmailRow {
  id: string;
  email: string;
  truth: Call;
  /** Round 2: the model's own call on this email. */
  model?: { says: string; right: boolean };
}

/** v3: a = e[2]==="s" ? "spam" : "ok". */
export function trainAnswer(e: TrainEmail): Call {
  return e[2] === 's' ? 'spam' : 'ok';
}

/** A test email's truth, from what the model said and whether it was right. */
export function testAnswer(e: TestEmail): Call {
  return (e[2] === 'SPAM') === (e[3] === 'r') ? 'spam' : 'ok';
}

export function trainRows(sc: TrainScenario = V3_SCENARIO): EmailRow[] {
  return sc.train.map((e) => ({ id: e[0], email: e[1], truth: trainAnswer(e) }));
}

export function testRows(sc: TrainScenario = V3_SCENARIO): EmailRow[] {
  return sc.test.map((e) => ({ id: e[0], email: e[1], truth: testAnswer(e), model: { says: e[2], right: e[3] === 'r' } }));
}

export const zoneLabel = (id: Call): string => ZONES.find((z) => z.id === id)?.label ?? id;

export type Calls = Readonly<Record<string, Call>>;

export const allCalled = (rows: readonly EmailRow[], calls: Calls): boolean => rows.every((r) => calls[r.id] !== undefined);

export const firstUncalled = (rows: readonly EmailRow[], calls: Calls): EmailRow | undefined => rows.find((r) => calls[r.id] === undefined);

export const wrongRows = (rows: readonly EmailRow[], calls: Calls): EmailRow[] => rows.filter((r) => calls[r.id] !== r.truth);

export const wrongMessage = (step: Step): string => (step === 'test' ? ROUND2_WRONG : ROUND1_WRONG);

/** A wrong call found by VERIFY: itemId = the email id (positional for variations). */
export function callMistake(row: EmailRow, call: Call): Mistake {
  return buildMistake('m1g1', {
    itemId: row.id,
    answer: call,
    correct: row.truth,
    itemText: row.email,
    answerLabel: zoneLabel(call),
    correctLabel: zoneLabel(row.truth),
  });
}

/** Step order: train → test → result. */
export function nextStep(s: Step): Step {
  return s === 'train' ? 'test' : 'result';
}
