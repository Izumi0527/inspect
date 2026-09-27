// 设备模块的统一导出入口
export { DeviceManagementView } from './components/DeviceManagementView'
export { DeviceIcon, StatusBadge } from './components/DeviceIcon'
export { getDeviceTypeLabel } from '@/utils/deviceTypes'
export { 
  useDevices, 
  useDeviceFilters, 
  useDeviceSelection 
} from './hooks/useDevices'
export { 
  fetchDevices, 
  fetchDevice, 
  createDevice, 
  updateDevice, 
  deleteDevice, 
  bulkDeviceAction 
} from './api/devices.api'
export type { 
  Device, 
  DeviceStatus, 
  DeviceType, 
  DeviceUIFilters,
  DeviceListQuery,
  DeviceSummary, 
  DeviceAction, 
  BulkAction 
} from './types'
