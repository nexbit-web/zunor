// Мозок підбору майстрів — єдиний вхід для роутів. Як він влаштований і
// які обіцянки тримає — README.md поруч.

export { startWaves, cancelWaves, scheduledCount } from './scheduler'
export { resumeDispatch } from './recovery'
export { markOpened, markResponded } from './data/journal'
export { masterFeedScope, type FeedScope } from './feed'
export { recommendForJob, type ProposalToRank } from './proposals'
export { DISPATCH_CONFIG } from './config'
export { WAVES_DONE_MIN } from './core/waves'
export type {
  DispatchResult,
  JobRef,
  Recommendation,
  ResumeReport,
  StopReason,
} from './types'
