import fs from 'fs'
import path from 'path'

interface FileRule {
  file: string
  bannedPatterns: RegExp[]
}

const ROOT = path.resolve(__dirname, '../../..')

const rules: FileRule[] = [
  {
    file: 'frontend/src/features/inspection/components/ExecutionDetailModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-gray-50 dark:bg-gray-800\/50/g,
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-700 dark:text-gray-300/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-500 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/CreateTemplateWizard.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /bg-white dark:bg-gray-700/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-800\/50/g,
      /border-gray-200 dark:border-gray-600/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-700 dark:text-gray-300/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-500 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/alerts/components/AlertDetailModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-800\/50/g,
      /border-gray-200 dark:border-gray-700/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-700 dark:text-gray-300/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-500 dark:text-gray-400/g,
      /text-gray-400 dark:text-gray-500/g,
      /hover:text-gray-900 dark:hover:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/InspectionProblemAnalysisModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-700 dark:text-gray-300/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-500 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/ConfigPreviewModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-500 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/InspectionCompareModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-700 dark:text-gray-300/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-500 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/InspectionTemplates.tsx',
    bannedPatterns: [
      /bg-white/g,
      /bg-gray-50/g,
      /border-gray-300/g,
      /text-gray-900/g,
      /text-gray-700/g,
      /text-gray-600/g,
      /text-gray-500/g,
      /text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateDetailModal.tsx',
    bannedPatterns: [
      /bg-white/g,
      /bg-gray-50/g,
      /border-gray-200/g,
      /text-gray-900/g,
      /text-gray-700/g,
      /text-gray-500/g,
      /text-gray-400/g,
      /dark:text-white/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/CheckItemGroup.tsx',
    bannedPatterns: [
      /bg-white/g,
      /bg-gray-50/g,
      /border-gray-200/g,
      /text-gray-900/g,
      /text-gray-700/g,
      /text-gray-600/g,
      /text-gray-500/g,
    ],
  },
  {
    file: 'frontend/src/app/page.tsx',
    bannedPatterns: [
      /bg-white/g,
      /text-gray-900/g,
      /text-gray-700/g,
      /text-gray-600/g,
      /border-gray-200/g,
      /border-gray-300/g,
      /border-white\/20/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/navigation.tsx',
    bannedPatterns: [
      /bg-white/g,
      /bg-gray-100/g,
      /bg-gray-50/g,
      /border-gray-200/g,
      /text-gray-900/g,
      /text-gray-700/g,
      /text-gray-600/g,
      /text-gray-500/g,
      /text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/InspectionExecutions.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-gray-50 dark:bg-gray-900/g,
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-300/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateImportModal.tsx',
    bannedPatterns: [
      /bg-white/g,
      /text-gray-900/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-700/g,
      /border-gray-200 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/StrategyModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-800/g,
      /bg-white dark:bg-gray-700/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/ReportPreviewModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/InspectionReports.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/ReportExportModal.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
      /bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400/g,
      /text-gray-700 dark:text-gray-300/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/InspectionReportModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateDetail.tsx',
    bannedPatterns: [
      /bg-white/g,
      /text-gray-900/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/logs/LogsSettings.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/charts.tsx',
    bannedPatterns: [
      /bg-white\/80 dark:bg-gray-900\/80/g,
      /border-gray-200\/50 dark:border-gray-700\/50/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-600/g,
    ],
  },
  {
    file: 'frontend/src/features/alerts/components/AdvancedFilters.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /bg-white dark:bg-gray-800/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/NotificationCenter.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-white/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/dropdown-menu.tsx',
    bannedPatterns: [
      /border-gray-200\/50 dark:border-gray-700\/50/g,
      /bg-white\/95 dark:bg-gray-900\/95/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/NetworkOverviewCard.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /bg-white dark:bg-gray-800/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/charts/NetworkTrafficStackedAreaChart.tsx',
    bannedPatterns: [
      /border-gray-200 pt-2 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/DeviceManagementView.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/DashboardHeader.tsx',
    bannedPatterns: [
      /bg-white dark:bg-card/g,
      /border-gray-200 dark:border-border/g,
      /text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/components/feedback/FeedbackSystem.tsx',
    bannedPatterns: [
      /bg-white dark:bg-card/g,
      /border-gray-200 dark:border-border/g,
      /text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/audit/AuditLogs.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
      /bg-gray-50 dark:bg-gray-800/g,
      /text-gray-700 dark:text-gray-300/g,
      /hover:bg-gray-50 dark:hover:bg-gray-800/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/users/UserPermissionsDialog.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/QuickTemplateCreate.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/traffic-analysis/components/TrafficSummaryCards.tsx',
    bannedPatterns: [
      /text-gray-900/g,
      /text-gray-600/g,
      /text-gray-700/g,
      /bg-gray-50/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/InspectionStrategies.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/logs/components/LogList.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700/g,
      /bg-gray-50 dark:bg-gray-800\/50/g,
      /bg-white dark:bg-gray-800/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/ReportEditModal.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /bg-white dark:bg-gray-800/g,
      /border-gray-300 dark:border-gray-600/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/app/(auth)/login/page.tsx',
    bannedPatterns: [
      /text-slate-900 dark:text-gray-100/g,
      /bg-white\/80 dark:bg-gray-900\/80/g,
      /bg-white\/50 dark:bg-gray-800\/60/g,
      /dark:border-gray-700\/50/g,
      /dark:border-gray-600/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/cards/RealTimeAlertsCard.tsx',
    bannedPatterns: [
      /border-gray-200\/50/g,
      /bg-white\/80/g,
      /text-gray-900 dark:text-foreground/g,
      /text-gray-900 dark:text-white/g,
      /dark:bg-gray-900\/60/g,
      /dark:hover:bg-gray-800\/80/g,
      /dark:border-gray-800/g,
    ],
  },
  {
    file: 'frontend/src/components/shared/HelpDialog.tsx',
    bannedPatterns: [
      /bg-white/g,
      /text-gray-900/g,
      /border-gray-300/g,
      /hover:bg-gray-50/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/DeviceManagementView.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/MonitoringView.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-foreground/g,
      /text-gray-900 dark:text-gray-100/g,
      /bg-gray-50 dark:bg-background/g,
      /text-gray-600 dark:text-gray-400/g,
      /border-gray-300 bg-gray-50/g,
    ],
  },
  {
    file: 'frontend/src/components/pwa/PWAHooks.tsx',
    bannedPatterns: [
      /bg-white/g,
      /text-gray-900/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/users/UserManagement.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /border-gray-200 dark:border-gray-700/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-700 dark:text-gray-300/g,
      /hover:bg-gray-50 dark:hover:bg-gray-800/g,
      /text-gray-600/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/backup/BackupHistorySection.tsx',
    bannedPatterns: [
      /border-gray-200/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/forms/CLIConfigForm.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /border-gray-200 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/modals/DeviceDetailsModal.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/forms/DeviceForm.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /bg-white dark:bg-gray-900/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/forms/SNMPConfigForm.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /border-gray-200 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/features/traffic-analysis/components/TrafficAnomaliesPanel.tsx',
    bannedPatterns: [
      /text-gray-900/g,
      /text-gray-600/g,
      /text-gray-700/g,
      /bg-gray-100 text-gray-800/g,
    ],
  },
  {
    file: 'frontend/src/features/traffic-analysis/components/TrafficTrendsChart.tsx',
    bannedPatterns: [
      /text-gray-600/g,
      /bg-gray-50/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/ExecutionFilters.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/BulkDeviceUpdate.tsx',
    bannedPatterns: [
      /text-gray-900/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/SettingsView.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-800/g,
      /border-gray-200 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/backup/BackupManagement.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/StatisticsReports.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-white/g,
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/reports/components/CustomReports.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
      /bg-gray-50 dark:bg-gray-800/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/ReportExportButton.tsx',
    bannedPatterns: [
      /border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800/g,
      /border-b border-gray-200 px-3 py-2 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/charts/DeviceStatusPieChart.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/cards/DeviceStatusCard.tsx',
    bannedPatterns: [
      /border-gray-200\/50/g,
      /bg-white\/80/g,
      /text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/cards/AvailabilityCard.tsx',
    bannedPatterns: [
      /border-gray-200\/50/g,
      /bg-white\/80/g,
      /text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateList.tsx',
    bannedPatterns: [
      /bg-white p-4 rounded-lg shadow/g,
    ],
  },
  {
    file: 'frontend/src/features/devices/components/BulkDeviceImport.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /border-gray-200 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/DashboardView.tsx',
    bannedPatterns: [
      /bg-white dark:bg-card/g,
    ],
  },
  {
    file: 'frontend/src/features/alerts/components/AlertStatsGrid.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
      /text-gray-600 dark:text-gray-400/g,
      /text-gray-600 dark:text-gray-500/g,
    ],
  },
  {
    file: 'frontend/src/features/alerts/components/AlertFiltersBar.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/components/lazy/LazyComponents.tsx',
    bannedPatterns: [
      /bg-white rounded-lg p-6 shadow-sm/g,
    ],
  },
  {
    file: 'frontend/src/lib/components/route-guard.tsx',
    bannedPatterns: [
      /bg-white\/80 backdrop-blur-lg rounded-2xl p-8 shadow-xl border border-white\/20/g,
    ],
  },
  {
    file: 'frontend/src/components/error/ErrorBoundary.tsx',
    bannedPatterns: [
      /bg-white dark:bg-card/g,
      /text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/badge.tsx',
    bannedPatterns: [
      /border-gray-200 dark:border-gray-700 bg-white\/80 dark:bg-gray-800\/80/g,
      /bg-white\/20 dark:bg-gray-800\/20/g,
      /text-gray-700 dark:text-gray-300/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/card.tsx',
    bannedPatterns: [
      /border-gray-200\/50 dark:border-border bg-white\/80 dark:bg-card\/80/g,
      /text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/DateRangePicker.tsx',
    bannedPatterns: [
      /bg-gray-100 cursor-not-allowed'\s*:\s*'bg-white'/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/button.tsx',
    bannedPatterns: [
      /hover:bg-white\/90 dark:hover:bg-gray-800\/90 text-gray-700 dark:text-gray-300/g,
    ],
  },
  {
    file: 'frontend/src/components/atoms/skeleton.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/components/layout/AppLayout.tsx',
    bannedPatterns: [
      /border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden/g,
    ],
  },
  {
    file: 'frontend/src/components/providers.tsx',
    bannedPatterns: [
      /bg-white\/90 text-gray-700/g,
      /dark:bg-gray-900\/80 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/components/shared/StatCard.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-white/g,
    ],
  },
  {
    file: 'frontend/src/features/alerts/components/AdvancedFilters.tsx',
    bannedPatterns: [
      /text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors/g,
    ],
  },
  {
    file: 'frontend/src/features/alerts/components/AlertListItem.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/NotificationCenter.tsx',
    bannedPatterns: [
      /text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/NotificationItem.tsx',
    bannedPatterns: [
      /text-gray-900 dark:text-white/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/RecentAlertsCard.tsx',
    bannedPatterns: [
      /font-medium text-gray-900 dark:text-foreground/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/Sidebar.tsx',
    bannedPatterns: [
      /bg-white dark:bg-card/g,
    ],
  },
  {
    file: 'frontend/src/features/dashboard/components/UserMenu.tsx',
    bannedPatterns: [
      /text-sm font-medium text-gray-900 dark:text-white/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/CheckItemEditor.tsx',
    bannedPatterns: [
      /bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/ExecutionEmptyState.tsx',
    bannedPatterns: [
      /text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/ExecutionTableSkeleton.tsx',
    bannedPatterns: [
      /border-b border-gray-200/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/InspectionAnalytics.tsx',
    bannedPatterns: [
      /text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateCard.tsx',
    bannedPatterns: [
      /bg-white hover:bg-gray-50 hover:shadow-sm/g,
    ],
  },
  {
    file: 'frontend/src/features/inspection/components/TemplateEditor.tsx',
    bannedPatterns: [
      /bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto/g,
    ],
  },
  {
    file: 'frontend/src/features/logs/components/LogDetailModal.tsx',
    bannedPatterns: [
      /border-t border-gray-200 dark:border-gray-700 pt-4/g,
    ],
  },
  {
    file: 'frontend/src/features/logs/components/LogListItem.tsx',
    bannedPatterns: [
      /text-sm text-gray-900 dark:text-gray-100 font-mono break-all line-clamp-2/g,
    ],
  },
  {
    file: 'frontend/src/features/logs/components/LogsView.tsx',
    bannedPatterns: [
      /border border-gray-200 dark:border-gray-700 rounded-lg/g,
    ],
  },
  {
    file: 'frontend/src/features/monitoring/components/charts/AvailabilityGaugeChart.tsx',
    bannedPatterns: [
      /font-medium text-gray-900 dark:text-gray-100/g,
      /text-gray-600/g,
      /bg-gray-50/g,
      /text-gray-600 dark:text-gray-400/g,
      /bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/backup/BackupConfigSection.tsx',
    bannedPatterns: [
      /bg-gray-50 border border-gray-200 rounded-md p-4/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/monitoring/MonitoringDashboard.tsx',
    bannedPatterns: [
      /border-b border-gray-200 bg-gray-50/g,
      /hover:bg-gray-50/g,
      /divide-y divide-gray-200/g,
      /text-left font-medium text-gray-700/g,
      /text-gray-600/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/shared/ActionButtons.tsx',
    bannedPatterns: [
      /bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/shared/EmptyState.tsx',
    bannedPatterns: [
      /text-lg font-medium text-gray-900 mb-2/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/shared/SectionHeader.tsx',
    bannedPatterns: [
      /text-lg font-semibold text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/features/settings/components/users/UserPasswordDialog.tsx',
    bannedPatterns: [
      /font-medium text-gray-900 dark:text-gray-100/g,
    ],
  },
  {
    file: 'frontend/src/app/globals.css',
    bannedPatterns: [
      /@apply bg-white\/80 backdrop-blur-lg border border-white\/20;/g,
      /@apply bg-white\/80 backdrop-blur-lg border border-white\/20 rounded-xl px-6 py-3 font-medium transition-all duration-300 hover:bg-white\/90 active:scale-95;/g,
      /@apply w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-purple-600 focus:ring-2 focus:ring-purple-500\/50 focus:ring-offset-0 transition-all duration-200 cursor-pointer;/g,
      /\.dark\[data-dark-variant='vscode'\] \.bg-white/g,
      /\.dark\[data-dark-variant='vscode'\] \.bg-gray-50/g,
      /\.dark\[data-dark-variant='vscode'\] \.bg-gray-100/g,
      /\.dark\[data-dark-variant='vscode'\] \.bg-white\\\/80/g,
      /\.dark\[data-dark-variant='vscode'\] \.bg-white\\\/95/g,
      /\.dark\[data-dark-variant='vscode'\] \.text-gray-900/g,
      /\.dark\[data-dark-variant='vscode'\] \.text-gray-800/g,
      /\.dark\[data-dark-variant='vscode'\] \.text-gray-700/g,
      /\.dark\[data-dark-variant='vscode'\] \.text-gray-600/g,
      /\.dark\[data-dark-variant='vscode'\] \.text-gray-500/g,
      /\.dark\[data-dark-variant='vscode'\] \.border-gray-200/g,
      /\.dark\[data-dark-variant='vscode'\] \.border-gray-300/g,
      /\.dark\[data-dark-variant='vscode'\] \.border-gray-200\\\/50/g,
      /\.dark\[data-dark-variant='vscode'\] \.border-white\\\/20/g,
    ],
  },
]

describe('阶段2业务模块语义化收敛', () => {
  it.each(rules)('$file 不应包含浅色硬编码组合', ({ file, bannedPatterns }) => {
    const fullPath = path.join(ROOT, file)
    const content = fs.readFileSync(fullPath, 'utf8')

    for (const pattern of bannedPatterns) {
      const matches = content.match(pattern) ?? []
      expect(matches.length).toBe(0)
    }
  })
})
