// Fresh case files on replay (Phase 2, scenario-variations.md).
export { CASE_FILE } from './copy';
export { CLASSIC_FIRST_PLAY, fetchCaseFile, setCaseFileClientForTests, wantsVariation, type CaseFile } from './caseFile';
export { CaseFileBadge, CaseFileLoading } from './CaseFileStatus';
export { ScenarioGame } from './ScenarioGame';
export { CONTENT_GAME_IDS, isContentGame, parseScenario, type ContentGameId, type GameScenario } from './schemas';
export { useCaseFile, type CaseFileState } from './useCaseFile';
