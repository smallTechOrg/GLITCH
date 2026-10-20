// Learner-facing copy for fresh case files (scenario-variations.md, spec/ui.md).
export const CASE_FILE = {
  /** Tag on a served NOVA-generated variation (never on the "fetching" card). */
  newTag: 'NEW CASE FILE',
  /** In-world note when the classic (v3) case file is played because NOVA could not serve one. */
  offlineNote: "NOVA'S OFFLINE — HERE'S A CLASSIC CASE FILE",
  /** Shown while the next case file is fetched. */
  fetching: 'NOVA IS PULLING A NEW CASE FILE…',
  /** Shown while a first play's case file is drawn (it may well be the classic one). */
  opening: 'OPENING THE CASE FILE…',
  /** Polite screen-reader announcement once a variation is served (the offline note announces itself). */
  loadedAnnounce: 'New case file loaded',
} as const;
