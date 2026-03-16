import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiOrigin } from "@/lib/api-client";
import {
  Server,
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  Power,
  AlertTriangle,
  Upload,
  Download,
  Activity,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Table,
  Column,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ConfirmModal,
} from "@/components/atoms";
import { AppLayout } from "@/components/layout";
import { useAuth } from "@/lib/contexts/auth-context";
import toast from "react-hot-toast";

import { Device, DeviceListQuery, DeviceStatus, DeviceType } from "../types";
import { DeviceIcon, StatusBadge, getDeviceTypeLabel } from "./DeviceIcon";
import { DeviceProbeButton } from "./DeviceProbeButton";
import { BulkDeviceImport } from "./BulkDeviceImport";
import { BulkDeviceUpdate } from "./BulkDeviceUpdate";
import { AddDeviceModal } from "./AddDeviceModal";
import { DeviceDetailsModal } from "./DeviceDetailsModal";
import { EditDeviceModal } from "./EditDeviceModal";
import {
  useDevices,
  useDeviceFilters,
  useDeviceSelection,
} from "../hooks/useDevices";
import {
  fetchDevice,
  fetchDeviceStats,
  updateDevice as updateDeviceApi,
  batchDeleteDevices,
  batchProbeDevices,
  bulkUpdateDevices,
} from "../api/devices.api";
import type { DevicePayload } from "../utils/deviceFormMapper";

const DEVICE_STATUSES: DeviceStatus[] = [
  "online",
  "offline",
  "warning",
  "maintenance",
];
const DEVICE_TYPES: DeviceType[] = [
  "switch",
  "router",
  "firewall",
  "wireless_ap",
];
const DEVICE_REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_API_BASE_URL = getApiOrigin();

const isDeviceStatus = (value: unknown): value is DeviceStatus =>
  typeof value === "string" && (DEVICE_STATUSES as string[]).includes(value);

const isDeviceType = (value: unknown): value is DeviceType =>
  typeof value === "string" && (DEVICE_TYPES as string[]).includes(value);

const formatPercentage = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    // 如果值在 0-1 之间（小数格式），转换为百分比
    if (value >= 0 && value < 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
    // 如果值在 1-100 之间（已经是百分比），直接使用
    return `${value.toFixed(1)}%`;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      // 如果值在 0-1 之间（小数格式），转换为百分比
      if (parsed >= 0 && parsed < 1) {
        return `${(parsed * 100).toFixed(1)}%`;
      }
      // 如果值在 1-100 之间（已经是百分比），直接使用
      return `${parsed.toFixed(1)}%`;
    }
  }
  return "-";
};

const toAlertCount = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
};

export const DeviceManagementView: React.FC = () => {
  const searchParams = useSearchParams();
  const appliedUrlSearchRef = React.useRef(false);
  const { user } = useAuth();
  const userPermissions = React.useMemo(
    () => ((user?.permissions ?? []) as unknown as string[]),
    [user?.permissions],
  );
  const canCreateDevice = userPermissions.includes("devices:create");
  const canUpdateDevice = userPermissions.includes("devices:update");
  const canDeleteDevice = userPermissions.includes("devices:delete");
  // 探测默认会写回设备探测状态，只有具备更新权限才允许写回
  const canPersistProbeStatus = canUpdateDevice;

  // 启用轮询：每60秒自动刷新设备数据（包括CPU和内存）
  const {
    devices,
    total,
    loading,
    error,
    errorStatus,
    setError,
    addDevice,
    removeDevice,
    importDevices,
    loadDevices,
  } = useDevices(true, DEVICE_REFRESH_INTERVAL_MS);
  const { filters, updateFilter } = useDeviceFilters();
  const {
    selectedDevices,
    toggleDevice: _toggleDevice,
    selectAll: _selectAll,
    clearSelection,
    setSelectedDevices,
  } = useDeviceSelection();

  // 统计数据（从独立API获取，不受分页影响）
  const [summary, setSummary] = React.useState({
    total: 0,
    online: 0,
    offline: 0,
    alerting: 0,
    totalAlerts: 0,
  });

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewingDevice, setViewingDevice] = useState<Device | null>(null);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [viewModalLoading, setViewModalLoading] = useState(false);
  const [editModalLoading, setEditModalLoading] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [bulkUpdateModalOpen, setBulkUpdateModalOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkProbing, setBulkProbing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false);
  const [selectedDeviceSnapshots, setSelectedDeviceSnapshots] = React.useState<
    Record<number, Device>
  >({});

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);

  // 搜索防抖：避免每次按键都触发后端请求
  const [debouncedSearch, setDebouncedSearch] = React.useState(
    filters.searchQuery,
  );
  const searchTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const filterSignature = [
    debouncedSearch,
    filters.statusFilter,
    filters.typeFilter,
  ].join("|");
  const previousFilterSignatureRef = React.useRef(filterSignature);
  const clearDeviceSelection = React.useCallback(() => {
    clearSelection();
    setSelectedDeviceSnapshots({});
  }, [clearSelection]);
  const handleSelectionChange = React.useCallback(
    (keys: Array<string | number>) => {
      const deviceIds = keys.filter(
        (key): key is number => typeof key === "number",
      );
      const selectedIdSet = new Set(deviceIds);

      setSelectedDevices(deviceIds);
      setSelectedDeviceSnapshots((previous) => {
        const next: Record<number, Device> = {};

        for (const deviceId of deviceIds) {
          const snapshot = previous[deviceId];
          if (snapshot) {
            next[deviceId] = snapshot;
          }
        }

        for (const device of devices) {
          if (selectedIdSet.has(device.id)) {
            next[device.id] = device;
          }
        }

        return next;
      });
    },
    [devices, setSelectedDevices],
  );
  const selectedDeviceRecords = React.useMemo(
    () =>
      selectedDevices
        .map((deviceId) => selectedDeviceSnapshots[deviceId])
        .filter((device): device is Device => device !== undefined),
    [selectedDeviceSnapshots, selectedDevices],
  );

  // 从 URL 查询参数初始化搜索词（Dashboard 顶栏搜索跳转会带上 ?search=xxx）
  React.useEffect(() => {
    if (appliedUrlSearchRef.current) return;
    const initialSearch = searchParams.get("search");
    if (initialSearch) {
      updateFilter("searchQuery", initialSearch);
    }
    appliedUrlSearchRef.current = true;
  }, [searchParams, updateFilter]);

  React.useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(filters.searchQuery);
    }, 350);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [filters.searchQuery]);

  // 服务端分页/筛选：当筛选条件或分页变化时，请求后端
  React.useEffect(() => {
    const filtersChanged =
      previousFilterSignatureRef.current !== filterSignature;

    if (filtersChanged) {
      previousFilterSignatureRef.current = filterSignature;
      clearDeviceSelection();

      if (currentPage !== 1) {
        setCurrentPage(1);
        return;
      }
    }

    const serverFilters: DeviceListQuery = {
      page: currentPage,
      page_size: pageSize,
    };
    if (debouncedSearch) serverFilters.search = debouncedSearch;
    if (filters.statusFilter && filters.statusFilter !== "all")
      serverFilters.status = filters.statusFilter;
    if (filters.typeFilter && filters.typeFilter !== "all")
      serverFilters.device_type = filters.typeFilter;

    let canceled = false;
    void loadDevices(serverFilters).finally(() => {
      if (!canceled) {
        setHasLoadedOnce(true);
      }
    });
    return () => {
      canceled = true;
    };
  }, [
    filterSignature,
    debouncedSearch,
    filters.statusFilter,
    filters.typeFilter,
    currentPage,
    pageSize,
    loadDevices,
    clearDeviceSelection,
  ]);

  React.useEffect(() => {
    if (selectedDevices.length === 0) {
      return;
    }

    const selectedIdSet = new Set(selectedDevices);
    setSelectedDeviceSnapshots((previous) => {
      let changed = false;
      const next = { ...previous };

      for (const device of devices) {
        if (selectedIdSet.has(device.id) && next[device.id] !== device) {
          next[device.id] = device;
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [devices, selectedDevices]);

  // 获取统计数据（独立于分页）
  const loadStats = React.useCallback(async () => {
    try {
      const stats = await fetchDeviceStats();
      setSummary({
        total: Number(stats.total_devices ?? 0),
        online: Number(stats.online_devices ?? 0),
        offline: Number(stats.offline_devices ?? 0),
        alerting: Number(stats.alerting_devices ?? stats.warning_devices ?? 0),
        totalAlerts: Number(stats.total_alerts ?? 0),
      });
    } catch {
      // 统计获取失败不影响主功能
    }
  }, []);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      loadStats();
    }, DEVICE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadStats]);

  // 分页变化处理
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // 批量删除处理
  const handleBulkDelete = () => {
    if (selectedDevices.length === 0) {
      toast.error("请先选择要删除的设备");
      return;
    }
    setBulkDeleteModalOpen(true);
  };

  const handleBulkUpdate = () => {
    if (selectedDevices.length === 0) {
      toast.error("请先选择要更新的设备");
      return;
    }
    setBulkUpdateModalOpen(true);
  };

  // 批量探测处理
  const handleBulkProbe = async () => {
    if (selectedDevices.length === 0) {
      toast.error("请先选择要探测的设备");
      return;
    }

    setBulkProbing(true);
    try {
      const result = await batchProbeDevices(selectedDevices, {
        updateStatus: canPersistProbeStatus,
      });
      const onlineCount = result.results.filter((r) => r.icmp_reachable).length;
      const snmpSuccessCount = result.results.filter(
        (r) => r.snmp_reachable,
      ).length;

      toast.success(
        `批量探测完成\n探测设备: ${result.probed}台\nICMP在线: ${onlineCount}台\nSNMP成功: ${snmpSuccessCount}台`,
        { duration: 5000 },
      );

      if (canPersistProbeStatus) {
        // 刷新设备列表和统计以显示最新状态
        await loadDevices();
        loadStats();
      }
      clearDeviceSelection();
    } catch (err) {
      const message = err instanceof Error ? err.message : "批量探测失败";
      toast.error(message);
    } finally {
      setBulkProbing(false);
    }
  };

  // 探测本页设备
  const handleProbeAll = async () => {
    if (devices.length === 0) {
      toast.error("没有可探测的设备");
      return;
    }

    const deviceIds = devices.map((d) => d.id);
    setBulkProbing(true);
    try {
      const result = await batchProbeDevices(deviceIds, {
        updateStatus: canPersistProbeStatus,
      });
      const onlineCount = result.results.filter((r) => r.icmp_reachable).length;
      const snmpSuccessCount = result.results.filter(
        (r) => r.snmp_reachable,
      ).length;

      toast.success(
        `全部探测完成\n探测设备: ${result.probed}台\nICMP在线: ${onlineCount}台\nSNMP成功: ${snmpSuccessCount}台`,
        { duration: 5000 },
      );

      if (canPersistProbeStatus) {
        // 刷新设备列表和统计以显示最新状态
        await loadDevices();
        loadStats();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "批量探测失败";
      toast.error(message);
    } finally {
      setBulkProbing(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedDevices.length === 0) return;

    setBulkDeleting(true);
    try {
      const result = await batchDeleteDevices(selectedDevices);
      if (result.success) {
        toast.success(result.message);
      } else {
        const failedPreview = result.failed_items
          ? result.failed_items
              .slice(0, 3)
              .map((item) => `#${item.device_id}`)
              .join("，")
          : "";
        const suffix = failedPreview
          ? `\n失败设备（部分）：${failedPreview}${result.failed_items && result.failed_items.length > 3 ? "…" : ""}`
          : "";
        toast.error(`${result.message}${suffix}`);
      }

      // 即使部分失败也要刷新数据：后端可能已删除部分设备
      clearDeviceSelection();
      await loadDevices();
      loadStats();
      setBulkDeleteModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "批量删除失败";
      toast.error(message);
      throw err;
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmBulkUpdate = async (updates: Partial<Device>) => {
    if (selectedDevices.length === 0) return;

    if (Object.keys(updates).length === 0) {
      toast.error("请至少填写一个要更新的字段值");
      return;
    }

    setBulkUpdating(true);
    try {
      const result = await bulkUpdateDevices({
        device_ids: selectedDevices,
        updates,
      });

      const succeeded = Number(result.processed_count ?? 0);
      const failed = Number(result.failed_count ?? 0);
      const total = succeeded + failed;

      const errorPreview = (result.errors ?? [])
        .slice(0, 3)
        .map((item) => {
          const idPart =
            typeof item.device_id === "number" ? `#${item.device_id}` : "";
          const namePart =
            typeof item.device_name === "string" && item.device_name.trim()
              ? item.device_name.trim()
              : "";
          const label =
            namePart && idPart ? `${namePart}（${idPart}）` : namePart || idPart;
          return label ? `${label}：${item.error}` : item.error;
        });

      const countsLine =
        total > 0 ? `\n成功：${succeeded} 台\n失败：${failed} 台` : "";
      const errorSuffix =
        errorPreview.length > 0
          ? `\n失败原因（部分）：\n${errorPreview.join("\n")}${(result.errors ?? []).length > 3 ? "\n…" : ""}`
          : "";

      const toastMessage = `${result.message}${countsLine}${failed > 0 ? errorSuffix : ""}`;

      if (result.success) {
        toast.success(toastMessage, { duration: 6000 });
      } else {
        toast.error(toastMessage, { duration: 8000 });
      }

      // 仅当至少有一台设备更新成功时，自动关闭弹窗并清空选择；否则保留现场便于用户修正后重试
      if (succeeded > 0) {
        clearDeviceSelection();
        setBulkUpdateModalOpen(false);
        await loadDevices();
        loadStats();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "批量更新失败";
      toast.error(message);
      throw error;
    } finally {
      setBulkUpdating(false);
    }
  };

  // 设备操作处理函数
  const handleViewDevice = async (device: Device) => {
    setViewModalOpen(true);
    setViewModalLoading(true);
    try {
      const latest = await fetchDevice(device.id);
      setViewingDevice(latest ?? device);
    } catch (error) {
      console.error("查看设备详情失败:", error);
      setViewingDevice(device);
    } finally {
      setViewModalLoading(false);
    }
  };

  const handleEditDevice = async (device: Device) => {
    setEditModalOpen(true);
    setEditModalLoading(true);
    try {
      const latest = await fetchDevice(device.id);
      setEditingDevice(latest ?? device);
    } catch (error) {
      console.error("加载设备编辑数据失败:", error);
      setEditingDevice(device);
    } finally {
      setEditModalLoading(false);
    }
  };

  const handleUpdateDevice = async (
    deviceId: number,
    payload: DevicePayload,
  ) => {
    try {
      setEditModalLoading(true);
      await updateDeviceApi(deviceId, payload);
      await loadDevices();
      loadStats();
      toast.success("设备更新成功");
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新设备失败";
      setError(message);
      console.error("更新设备失败:", error);
      toast.error(message);
      throw error;
    } finally {
      setEditModalLoading(false);
    }
  };

  const handleDeleteDevice = (device: Device) => {
    setDeviceToDelete(device);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deviceToDelete) return;

    try {
      await removeDevice(deviceToDelete.id);
      setDeviceToDelete(null);
      loadStats();
      toast.success("设备删除成功");
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除设备失败";
      toast.error(message);
      throw err;
    }
  };

  const handleAddDevice = () => {
    setAddModalOpen(true);
  };

  const handleBulkImport = () => {
    setImportModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const BOM = "\uFEFF"; // UTF-8 BOM - 让 Excel 正确识别 UTF-8 编码
    const headerLine =
      "设备名称,IP地址,设备类型,厂商,位置,描述,SNMP团体字符串,SSH用户名,SSH密码";
    const sampleLines = [
      "核心交换机1,192.168.1.1,switch,cisco,数据中心A,核心网络设备,public,admin,",
      "路由器网关1,192.168.1.254,router,huawei,数据中心A,主网关路由器,public,admin,",
      "边界防火墙1,192.168.1.100,firewall,fortinet,数据中心B,边界防护设备,public,admin,",
    ];
    const csvContent = BOM + [headerLine, ...sampleLines].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "设备导入模板.csv";
    link.click();
  };

  // 表格列定义
  const columns: Column<Device>[] = [
    {
      key: "name",
      title: "设备名称",
      width: "200px",
      render: (_, record) => (
        <div className="flex items-center gap-1.5">
          <div className="flex-shrink-0 w-6 h-6 rounded-md bg-muted/60 dark:bg-muted flex items-center justify-center">
            <DeviceIcon
              type={record.device_type}
              className="h-4 w-4 text-muted-foreground dark:text-foreground/90"
            />
          </div>
          <div>
            <div className="font-medium text-foreground leading-tight">
              {record.name}
            </div>
            <div className="text-xs text-muted-foreground leading-tight">
              {record.ip}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "device_type",
      title: "设备类型",
      width: "120px",
      render: (value) =>
        isDeviceType(value) ? getDeviceTypeLabel(value) : "-",
    },
    {
      key: "status",
      title: "状态",
      width: "140px",
      render: (_, record) => (
        <div className="flex items-center gap-1.5">
          {/* 主状态 */}
          {isDeviceStatus(record.status) ? (
            <StatusBadge status={record.status} />
          ) : (
            <span className="text-muted-foreground">未知</span>
          )}
          {/* 探测状态指示器 */}
          {(record.icmp_status || record.snmp_status) && (
            <div className="flex items-center gap-1 text-[10px] leading-none">
              {/* ICMP状态 */}
              <span
                className={`inline-flex items-center px-1 py-0.5 rounded ${
                  record.icmp_status === "online"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
                title={`ICMP: ${record.icmp_status === "online" ? "在线" : "离线"}${record.response_time ? ` (${record.response_time.toFixed(1)}ms)` : ""}`}
              >
                ICMP
              </span>
              {/* SNMP状态 */}
              <span
                className={`inline-flex items-center px-1 py-0.5 rounded ${
                  record.snmp_status === "success"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : record.snmp_status === "not_configured"
                      ? "bg-muted/60 text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                }`}
                title={`SNMP: ${
                  record.snmp_status === "success"
                    ? "成功"
                    : record.snmp_status === "not_configured"
                      ? "未配置"
                      : "失败"
                }`}
              >
                SNMP
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "location",
      title: "位置",
      width: "150px",
    },
    {
      key: "cpu_usage",
      title: "CPU使用率",
      width: "120px",
      align: "right",
      render: (value) => (
        <span className="tabular-nums">{formatPercentage(value)}</span>
      ),
    },
    {
      key: "memory_usage",
      title: "内存使用率",
      width: "120px",
      align: "right",
      render: (value) => (
        <span className="tabular-nums">{formatPercentage(value)}</span>
      ),
    },
    {
      key: "alert_count",
      title: "告警数",
      width: "80px",
      align: "right",
      render: (value) => {
        const count = toAlertCount(value);
        return (
          <Badge
            variant={count > 0 ? "error" : "secondary"}
            size="sm"
            className="tabular-nums"
          >
            {count}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      title: "操作",
      width: "160px",
      render: (_, record) => (
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <DeviceProbeButton
            deviceId={record.id}
            deviceName={record.name}
            size="sm"
            variant="ghost"
            hideLabel
            updateStatus={canPersistProbeStatus}
            onProbeComplete={() => {
              if (canPersistProbeStatus) {
                // 探测完成后刷新设备列表和统计以显示最新状态
                loadDevices();
                loadStats();
              }
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewDevice(record)}
            aria-label={`查看设备 ${record.name}`}
            title="查看"
            className="px-2"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleEditDevice(record)}
            disabled={!canUpdateDevice}
            aria-label={`编辑设备 ${record.name}`}
            title={canUpdateDevice ? "编辑" : "需要设备更新权限"}
            className="px-2"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleDeleteDevice(record)}
            disabled={!canDeleteDevice}
            aria-label={`删除设备 ${record.name}`}
            title={canDeleteDevice ? "删除" : "需要设备删除权限"}
            className="px-2"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (error && devices.length === 0 && hasLoadedOnce) {
    if (errorStatus === 403) {
      return (
        <AppLayout title="设备管理 - 无权限">
          <div className="text-center py-12">
            <div className="mb-6">
              <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                无权限访问设备管理
              </h3>
              <p className="text-muted-foreground mb-4">
                {error || "您没有访问该页面的权限，请联系管理员开通权限。"}
              </p>
              <div className="space-x-3">
                <Button onClick={() => window.history.back()} variant="outline">
                  返回上一页
                </Button>
                <Button
                  onClick={() => {
                    setError(null);
                    loadDevices();
                  }}
                >
                  重试加载
                </Button>
              </div>
            </div>
          </div>
        </AppLayout>
      );
    }

    return (
      <AppLayout title="设备管理 - 错误">
        <div className="text-center py-12">
          <div className="mb-6">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              无法加载设备数据
            </h3>
            <p className="text-muted-foreground mb-4">{error}</p>
            <div className="space-x-3">
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                刷新页面
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  loadDevices();
                }}
              >
                重试加载
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <p>可能的原因：</p>
            <ul className="mt-2 text-left inline-block">
              <li>
                • 后端服务未启动 (检查 {DEFAULT_API_BASE_URL}/api/v1)
              </li>
              <li>• 网络连接问题</li>
              <li>• 数据库连接失败</li>
            </ul>
          </div>
        </div>
      </AppLayout>
    );
  }

  const isInitialLoading = !hasLoadedOnce;
  const isRefreshing = loading && hasLoadedOnce;
  const showEmptyState = devices.length === 0 && hasLoadedOnce && !error;
  const showTable = devices.length > 0 || isInitialLoading;

  return (
    <AppLayout title="设备管理" alertCount={summary.totalAlerts}>
      <div className="flex flex-col gap-1.5 h-full min-h-0">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-1.5">
          <Card>
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className="p-1 rounded-md bg-blue-100 dark:bg-blue-900/30">
                  <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="ml-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    总设备数
                  </p>
                  <p className="text-lg font-bold text-foreground leading-none">
                    {summary.total}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className="p-1 rounded-md bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="ml-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    在线设备
                  </p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400 leading-none">
                    {summary.online}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className="p-1 rounded-md bg-red-100 dark:bg-red-900/30">
                  <Power className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="ml-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    离线设备
                  </p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400 leading-none">
                    {summary.offline}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className="p-1 rounded-md bg-yellow-100 dark:bg-yellow-900/30">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div className="ml-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    告警设备
                  </p>
                  <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400 leading-none">
                    {summary.alerting}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2.5">
              <div className="flex items-center">
                <div className="p-1 rounded-md bg-purple-100 dark:bg-purple-900/30">
                  <AlertTriangle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="ml-2.5">
                  <p className="text-xs font-medium text-muted-foreground leading-tight">
                    总告警数
                  </p>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400 leading-none">
                    {summary.totalAlerts}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 筛选和搜索 */}
        <Card className="flex-1 flex flex-col overflow-hidden min-h-0">
          <CardHeader className="p-2.5 pb-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm leading-tight">设备列表</CardTitle>
                {isRefreshing && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5 animate-spin" />
                    <span>刷新中</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleProbeAll}
                  disabled={bulkProbing || devices.length === 0}
                  className="gap-1"
                >
                  {bulkProbing ? (
                    <Activity className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                  探测本页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="gap-1"
                >
                  <Download className="h-4 w-4" />
                  下载模板
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkImport}
                  disabled={!canCreateDevice}
                  title={canCreateDevice ? undefined : "需要设备新增权限"}
                  className="gap-1"
                >
                  <Upload className="h-4 w-4" />
                  批量导入
                </Button>
                <Button
                  onClick={handleAddDevice}
                  size="sm"
                  disabled={!canCreateDevice}
                  title={canCreateDevice ? undefined : "需要设备新增权限"}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  添加设备
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden p-2.5 pt-0 min-h-0">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-1">
              <div className="flex-1 min-w-[240px] max-w-md">
                <Input
                  placeholder="搜索设备名称、IP或位置..."
                  value={filters.searchQuery}
                  onChange={(e) => updateFilter("searchQuery", e.target.value)}
                  className="w-full h-8 text-xs leading-tight px-2.5 py-1 rounded-lg"
                />
              </div>
              <Select
                value={filters.statusFilter}
                onValueChange={(value) => updateFilter("statusFilter", value)}
              >
                <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs leading-tight px-2.5 py-1 rounded-lg">
                  <SelectValue placeholder="状态筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="online">在线</SelectItem>
                  <SelectItem value="offline">离线</SelectItem>
                  <SelectItem value="warning">告警</SelectItem>
                  <SelectItem value="maintenance">维护</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.typeFilter}
                onValueChange={(value) => updateFilter("typeFilter", value)}
              >
                <SelectTrigger className="w-full sm:w-[160px] h-8 text-xs leading-tight px-2.5 py-1 rounded-lg">
                  <SelectValue placeholder="类型筛选" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="switch">交换机</SelectItem>
                  <SelectItem value="router">路由器</SelectItem>
                  <SelectItem value="firewall">防火墙</SelectItem>
                  <SelectItem value="wireless_ap">无线AP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && devices.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mb-1 px-2.5 py-1 bg-red-50/60 dark:bg-red-900/15 border border-border/50 rounded-md">
                <span className="text-xs text-red-700 dark:text-red-300">
                  发生错误：{error}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    loadDevices();
                  }}
                  className="h-7 px-2 text-xs"
                >
                  重试
                </Button>
              </div>
            )}

            {/* 批量操作栏 */}
            {selectedDevices.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mb-1 px-2.5 py-1 bg-blue-50/60 dark:bg-blue-900/15 border border-border/50 rounded-md">
                <span className="text-xs leading-tight text-blue-700 dark:text-blue-300">
                  已选择 {selectedDevices.length} 台设备
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkUpdate}
                  disabled={bulkUpdating || !canUpdateDevice}
                  title={canUpdateDevice ? undefined : "需要设备更新权限"}
                >
                  批量更新
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkProbe}
                  disabled={bulkProbing}
                  className="gap-1"
                >
                  {bulkProbing ? (
                    <Activity className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4" />
                  )}
                  批量探测
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={!canDeleteDevice}
                  title={canDeleteDevice ? undefined : "需要设备删除权限"}
                  className="gap-1"
                >
                  <Trash2 className="h-4 w-4" />
                  批量删除
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearDeviceSelection}
                  className="sm:ml-auto"
                >
                  取消选择
                </Button>
              </div>
            )}

            {/* 设备表格 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {showEmptyState && (
                <div className="text-center py-6">
                  <Server className="h-9 w-9 text-muted-foreground/80 mx-auto mb-2" />
                  <h3 className="text-base font-semibold text-foreground mb-2">
                    暂无设备数据
                  </h3>
                  <p className="text-sm leading-tight text-muted-foreground">
                    {debouncedSearch ||
                    filters.statusFilter !== "all" ||
                    filters.typeFilter !== "all"
                      ? "当前筛选条件下没有找到匹配的设备，请尝试调整筛选条件。"
                      : "系统中还没有添加任何设备,点击上方「添加设备」按钮开始管理您的网络设备。"}
                  </p>
                  {isRefreshing && (
                    <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                      <Activity className="h-3.5 w-3.5 animate-spin" />
                      <span>正在刷新...</span>
                    </div>
                  )}
                </div>
              )}

              {showTable && (
                <Table
                  columns={columns}
                  data={devices}
                  loading={isInitialLoading}
                  rowKey="id"
                  size="small"
                  className="border-0 bg-transparent backdrop-blur-none rounded-none"
                  rowSelection={{
                    selectedRowKeys: selectedDevices,
                    onChange: handleSelectionChange,
                  }}
                  pagination={{
                    current: currentPage,
                    pageSize: pageSize,
                    total: total,
                    onChange: (page) => handlePageChange(page),
                  }}
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* 删除确认对话框 */}
        <ConfirmModal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false);
            setDeviceToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="删除设备"
          description={`确定要删除设备 "${deviceToDelete?.name}" 吗？此操作不可撤销。`}
          confirmText="删除"
          cancelText="取消"
          variant="destructive"
        />

        {/* 批量删除确认对话框 */}
        <ConfirmModal
          isOpen={bulkDeleteModalOpen}
          onClose={() => setBulkDeleteModalOpen(false)}
          onConfirm={confirmBulkDelete}
          title="批量删除设备"
          description={`确定要删除选中的 ${selectedDevices.length} 台设备吗？此操作不可撤销。`}
          confirmText={bulkDeleting ? "删除中..." : "确认删除"}
          cancelText="取消"
          variant="destructive"
        />

        <BulkDeviceUpdate
          isOpen={bulkUpdateModalOpen}
          onClose={() => setBulkUpdateModalOpen(false)}
          selectedDevices={selectedDeviceRecords}
          onBulkUpdate={confirmBulkUpdate}
          isProcessing={bulkUpdating}
        />

        <DeviceDetailsModal
          isOpen={viewModalOpen}
          onClose={() => {
            setViewModalOpen(false);
            setViewingDevice(null);
          }}
          device={viewingDevice}
          loading={viewModalLoading}
          updateStatus={canPersistProbeStatus}
        />

        <EditDeviceModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingDevice(null);
          }}
          device={editingDevice}
          loading={editModalLoading}
          onSubmit={handleUpdateDevice}
        />

        {/* 添加设备模态框 */}
        <AddDeviceModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSubmit={async (data) => {
            await addDevice(data);
            loadStats();
          }}
          loading={loading}
        />

        {/* 批量导入模态框 */}
        <BulkDeviceImport
          isOpen={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onImport={async (data) => {
            const result = await importDevices(data);
            if (result.success && result.imported_count > 0) {
              loadStats();
            }
            return result;
          }}
        />
      </div>
    </AppLayout>
  );
};
