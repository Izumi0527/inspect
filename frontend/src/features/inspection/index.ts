// 主要组件导出
export { InspectionView } from './components/InspectionView'
export { InspectionStrategies } from './components/InspectionStrategies'
export { InspectionTemplates } from './components/InspectionTemplates'
export { InspectionExecutions } from './components/InspectionExecutions'
export { InspectionAnalytics } from './components/InspectionAnalytics'
export { StrategyModal } from './components/StrategyModal'

// 模板相关组件导出
export { TemplateEditor } from './components/TemplateEditor'
export { TemplateEditorWrapper } from './components/TemplateEditorWrapper'
export { TemplateDetailModal } from './components/TemplateDetailModal'
export { TemplateImportModal } from './components/TemplateImportModal'
export { CheckItemEditor } from './components/CheckItemEditor'

// API函数导出
export {
  fetchInspectionStats,
  fetchInspectionTemplates,
  fetchInspectionTemplate,
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  exportInspectionTemplate,
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
  useUpdateTemplate,
  useDeleteTemplate,
  useInspectionExecutions,
  useInspectionExecution,
  useExecutionDetail,
  useTriggerExecution,
  useStopExecution,
  useDeleteExecution,
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