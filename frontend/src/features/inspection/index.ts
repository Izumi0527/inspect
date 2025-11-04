// 主要组件导出
export { InspectionView } from './components/InspectionView'
export { InspectionStrategies } from './components/InspectionStrategies'
export { InspectionTemplates } from './components/InspectionTemplates'
export { InspectionExecutions } from './components/InspectionExecutions'
export { InspectionAnalytics } from './components/InspectionAnalytics'
export { StrategyModal } from './components/StrategyModal'

// API服务导出 - 暂时禁用，等待API重构完成
// export {
//   inspectionStrategyApi,
//   inspectionTemplateApi,
//   inspectionExecutionApi,
//   inspectionReportApi,
//   inspectionStatsApi
// } from './api/inspection.api'

// 可用的API函数导出
export {
  fetchInspectionStats
} from './api/inspection.api'

// Hooks导出
export {
  useInspectionStrategies,
  useInspectionStrategy,
  useCreateStrategy,
  useUpdateStrategy,
  useDeleteStrategy,
  useToggleStrategy,
  useInspectionTemplates,
  useInspectionTemplate,
  useCreateTemplate,
  useCloneTemplate,
  useInspectionExecutions,
  useInspectionExecution,
  useTriggerExecution,
  useStopExecution,
  useInspectionStats,
  useInspectionTrends,
  useInspectionReports,
  useGenerateReport,
  useInspectionFilters,
  useExecutionProgress
} from './hooks/useInspection'

// 类型定义导出
export type {
  InspectionStrategy,
  InspectionTemplate,
  InspectionCheckItem,
  InspectionExecution,
  InspectionSummary,
  DeviceInspectionResult,
  CheckResult,
  InspectionReport,
  InspectionStats,
  InspectionApiResponse
} from './types'