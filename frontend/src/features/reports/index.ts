// 主要组件导出
export { ReportsView } from './components/ReportsView'
export { InspectionReports } from './components/InspectionReports'
export { InspectionReportModal } from './components/InspectionReportModal'
export { ReportPreviewModal } from './components/ReportPreviewModal'
export { TrendAnalysis } from './components/TrendAnalysis'
export { StatisticsReports } from './components/StatisticsReports'
export { CustomReports } from './components/CustomReports'

// API服务导出
export {
  reportsApi,
  inspectionReportsApi,
  trendAnalysisApi,
  statisticsApi,
  customReportsApi,
  reportTemplatesApi,
  exportApi,
  reportStatsApi
} from './api/reports.api'

// Hooks导出
export {
  useReports,
  useReport,
  useCreateReport,
  useUpdateReport,
  useDeleteReport,
  useGenerateReport,
  useCloneReport,
  useInspectionReportData,
  useGenerateInspectionReport,
  useCompareDeviceReports,
  useTrendAnalysis,
  useGenerateTrendReport,
  usePredictions,
  useAnomalyDetection,
  useStatistics,
  useGenerateStatisticsReport,
  useKPIData,
  useRankings,
  useCustomReportConfigs,
  useCustomReportConfig,
  useCreateCustomReportConfig,
  useGenerateFromConfig,
  useReportTemplates,
  useReportTemplate,
  useCreateReportTemplate,
  useExportToExcel,
  useExportToPDF,
  useExportToWord,
  useReportStats,
  useUsageAnalysis,
  useReportFilters,
  useReportParameters,
  useReportProgress
} from './hooks/useReports'

// 类型定义导出
export type {
  Report,
  ReportParameters,
  ReportSchedule,
  InspectionReportData,
  DeviceReportResult,
  ExecutionTrendData,
  ProblemAnalysisData,
  RecommendationData,
  IssueData,
  PerformanceMetrics,
  TrendAnalysisData,
  TrendMetric,
  PredictionData,
  TrendAlertData,
  StatisticsData,
  DevicePerformanceStats,
  AggregatedPerformanceStats,
  ComplianceIssue,
  PeriodStats,
  CustomReportConfig,
  ReportTemplate,
  TemplateSection,
  ChartConfig,
  TableConfig,
  TableColumnConfig,
  FilterConfig,
  LayoutConfig,
  LayoutSection,
  ReportStyles,
  ReportsApiResponse,
  ReportStats
} from './types'