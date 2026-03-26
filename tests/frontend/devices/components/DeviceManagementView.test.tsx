import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { DeviceManagementView } from "@/features/devices/components/DeviceManagementView";
import { fetchDeviceStats } from "@/features/devices/api/devices.api";

const mockLoadDevices = jest.fn(() => Promise.resolve());
const mockSetError = jest.fn();
const mockAddDevice = jest.fn();
const mockRemoveDevice = jest.fn();
const mockImportDevices = jest.fn();

const createMockDevice = (id: number, overrides: Partial<{
  name: string;
  ip: string;
  device_type: "router" | "switch";
  status: "online" | "offline";
  location: string;
  last_seen: string;
  uptime: string;
  alert_count: number;
}> = {}) => ({
  id,
  name: overrides.name ?? `edge-0${id}`,
  ip: overrides.ip ?? `10.0.0.${id}`,
  device_type: overrides.device_type ?? ("router" as const),
  status: overrides.status ?? ("online" as const),
  location: overrides.location ?? "A区",
  last_seen: overrides.last_seen ?? "2026-03-10T00:00:00Z",
  uptime: overrides.uptime ?? "3600",
  alert_count: overrides.alert_count ?? 1,
});

let mockDevices = [
  {
    ...createMockDevice(1),
  },
];
let mockError: string | null = null;
let mockSearchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/contexts/auth-context", () => ({
  useAuth: () => ({
    user: {
      permissions: ["devices:create", "devices:update", "devices:delete"],
    },
  }),
}));

jest.mock("react-hot-toast", () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/components/layout", () => ({
  AppLayout: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

jest.mock("@/components/atoms", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    className?: string;
  }) => (
    <input value={value} onChange={onChange} placeholder={placeholder} />
  ),
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <>{placeholder}</>
  ),
  ConfirmModal: ({
    isOpen,
    title,
    description,
    onClose,
    onConfirm,
    confirmText,
    cancelText,
  }: {
    isOpen: boolean;
    title: string;
    description: string;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    confirmText?: string;
    cancelText?: string;
  }) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        <div>{description}</div>
        <button type="button" onClick={() => onClose()}>
          {cancelText ?? "取消"}
        </button>
        <button
          type="button"
          onClick={async () => {
            await onConfirm();
          }}
        >
          {confirmText ?? "确认"}
        </button>
      </div>
    ) : null,
  Table: ({
    data,
    rowSelection,
    pagination,
  }: {
    data: Array<{ id: number; name: string }>;
    rowSelection?: {
      selectedRowKeys: Array<string | number>;
      onChange: (
        selectedRowKeys: Array<string | number>,
        selectedRows: Array<{ id: number; name: string }>,
      ) => void;
    };
    pagination?: {
      current: number;
      pageSize: number;
      total: number;
      onChange: (page: number, pageSize: number) => void;
    };
  }) => (
    <div>
      <button
        type="button"
        onClick={() => {
          const nextKeys = Array.from(
            new Set([...(rowSelection?.selectedRowKeys ?? []), data[0].id]),
          );
          rowSelection?.onChange(nextKeys, [data[0]]);
        }}
      >
        选择第一行
      </button>
      <button
        type="button"
        onClick={() =>
          pagination?.onChange((pagination?.current ?? 1) + 1, pagination.pageSize)
        }
      >
        下一页
      </button>
      {data.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  ),
}));

jest.mock("@/features/devices/components/DeviceIcon", () => ({
  DeviceIcon: () => <div>icon</div>,
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  getDeviceTypeLabel: (value: string) => value,
}));

jest.mock("@/features/devices/components/DeviceProbeButton", () => ({
  DeviceProbeButton: () => <button type="button">探测</button>,
}));

jest.mock("@/features/devices/components/BulkDeviceImport", () => ({
  BulkDeviceImport: () => null,
}));

jest.mock("@/features/devices/components/BulkDeviceUpdate", () => ({
  BulkDeviceUpdate: ({
    isOpen,
    selectedDevices,
    onBulkUpdate,
  }: {
    isOpen: boolean;
    selectedDevices: Array<{ id: number; name: string }>;
    onBulkUpdate: (updates: Record<string, unknown>) => Promise<void>;
  }) =>
    isOpen ? (
      <div>
        <div>批量更新设备弹窗</div>
        {selectedDevices.map((device) => (
          <div key={device.id}>{device.name}</div>
        ))}
        <button
          type="button"
          onClick={() => onBulkUpdate({ location: "机房-Z" })}
        >
          提交批量更新
        </button>
      </div>
    ) : null,
}));

jest.mock("@/features/devices/components/modals/AddDeviceModal", () => ({
  AddDeviceModal: () => null,
}));

jest.mock("@/features/devices/components/modals/DeviceDetailsModal", () => ({
  DeviceDetailsModal: () => null,
}));

jest.mock("@/features/devices/components/modals/EditDeviceModal", () => ({
  EditDeviceModal: () => null,
}));

jest.mock("@/features/devices/hooks/useDevices", () => {
  const React = require("react");

  return {
    useDevices: () => ({
      devices: mockDevices,
      total: mockDevices.length,
      loading: false,
      error: mockError,
      setError: mockSetError,
      addDevice: mockAddDevice,
      removeDevice: mockRemoveDevice,
      importDevices: mockImportDevices,
      loadDevices: mockLoadDevices,
    }),
    useDeviceFilters: () => {
      const [filters, setFilters] = React.useState({
        searchQuery: "",
        statusFilter: "all",
        typeFilter: "all",
      });

      return {
        filters,
        updateFilter: (key: string, value: string) =>
          setFilters((prev: Record<string, string>) => ({
            ...prev,
            [key]: value,
          })),
      };
    },
    useDeviceSelection: () => {
      const [selectedDevices, setSelectedDevices] = React.useState<number[]>([]);
      const clearSelection = React.useCallback(() => {
        setSelectedDevices([]);
      }, []);

      return {
        selectedDevices,
        toggleDevice: jest.fn(),
        selectAll: jest.fn(),
        clearSelection,
        setSelectedDevices,
      };
    },
  };
});

jest.mock("@/features/devices/api/devices.api", () => ({
  fetchDevice: jest.fn(),
  fetchDeviceStats: jest.fn(),
  updateDevice: jest.fn(),
  batchDeleteDevices: jest.fn(),
  batchProbeDevices: jest.fn(),
  bulkUpdateDevices: jest.fn(),
}));

describe("DeviceManagementView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadDevices.mockResolvedValue(undefined);
    mockDevices = [createMockDevice(1)];
    mockError = null;
    mockSearchParams = new URLSearchParams();
    (fetchDeviceStats as jest.Mock).mockResolvedValue({
      total_devices: 1,
      online_devices: 1,
      offline_devices: 0,
      alerting_devices: 1,
      total_alerts: 2,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("应随轮询周期刷新统计卡片数据", async () => {
    jest.useFakeTimers();

    render(<DeviceManagementView />);

    await waitFor(() => {
      expect(fetchDeviceStats).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      jest.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    expect(fetchDeviceStats).toHaveBeenCalledTimes(2);
  });

  it("应展示与新页面一致的统计卡片文案", async () => {
    render(<DeviceManagementView />);

    await waitFor(() => {
      expect(screen.getByText("总设备数")).toBeInTheDocument();
    });

    expect(screen.getByText("在线设备")).toBeInTheDocument();
    expect(screen.getByText("离线设备")).toBeInTheDocument();
    expect(screen.getByText("告警设备")).toBeInTheDocument();
    expect(screen.getByText("总告警数")).toBeInTheDocument();
  });

  it("筛选变化后应清空跨页批量选择，避免旧筛选结果残留", async () => {
    render(<DeviceManagementView />);

    fireEvent.click(screen.getByRole("button", { name: "选择第一行" }));

    expect(screen.getByText("已选择 1 台设备")).toBeInTheDocument();

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "online" },
    });

    await waitFor(() => {
      expect(screen.queryByText("已选择 1 台设备")).not.toBeInTheDocument();
    });
  });

  it("筛选变化时应直接请求第一页，避免先请求旧页码再回跳", async () => {
    render(<DeviceManagementView />);

    await waitFor(() => {
      expect(mockLoadDevices).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(mockLoadDevices).toHaveBeenCalledTimes(2);
    });

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "online" },
    });

    await waitFor(() => {
      expect(mockLoadDevices).toHaveBeenCalledTimes(3);
    });

    expect(mockLoadDevices).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        page_size: 10,
        status: "online",
      }),
    );
  });

  it("跨页选择后打开批量更新时应保留各页设备快照", async () => {
    const { rerender } = render(<DeviceManagementView />);

    fireEvent.click(screen.getByRole("button", { name: "选择第一行" }));

    expect(screen.getByText("已选择 1 台设备")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    mockDevices = [createMockDevice(2, { name: "edge-02", status: "offline" })];
    rerender(<DeviceManagementView />);

    await waitFor(() => {
      expect(screen.getByText("已选择 1 台设备")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "选择第一行" }));

    expect(screen.getByText("已选择 2 台设备")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "批量更新" }));

    const bulkUpdateModal = screen.getByText("批量更新设备弹窗").parentElement;

    expect(bulkUpdateModal).not.toBeNull();
    expect(
      within(bulkUpdateModal as HTMLElement).getByText("edge-01"),
    ).toBeInTheDocument();
    expect(
      within(bulkUpdateModal as HTMLElement).getByText("edge-02"),
    ).toBeInTheDocument();
  });

  it("有数据时发生错误应展示提示条，点击重试应清空错误并重新触发加载", async () => {
    mockError = "boom";

    render(<DeviceManagementView />);

    await waitFor(() => {
      expect(screen.getByText("发生错误：boom")).toBeInTheDocument();
    });

    mockSetError.mockClear();
    mockLoadDevices.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(mockSetError).toHaveBeenCalledWith(null);
    await waitFor(() => {
      expect(mockLoadDevices).toHaveBeenCalled();
    });
  });

  it("批量删除确认后应调用后端接口，并提示成功", async () => {
    const toast = (await import("react-hot-toast")).default as unknown as {
      success: jest.Mock;
      error: jest.Mock;
    };
    const { batchDeleteDevices } = await import("@/features/devices/api/devices.api");

    (batchDeleteDevices as jest.Mock).mockResolvedValue({
      success: true,
      message: "已删除",
      deleted_count: 1,
      failed_count: 0,
      failed_items: [],
    });

    render(<DeviceManagementView />);

    fireEvent.click(screen.getByRole("button", { name: "选择第一行" }));
    expect(screen.getByText("已选择 1 台设备")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() => {
      expect(batchDeleteDevices).toHaveBeenCalledWith([1]);
    });
    expect(toast.success).toHaveBeenCalledWith("已删除");
  });

  it("批量更新提交后应调用后端接口并刷新", async () => {
    const toast = (await import("react-hot-toast")).default as unknown as {
      success: jest.Mock;
      error: jest.Mock;
    };
    const { bulkUpdateDevices } = await import("@/features/devices/api/devices.api");

    (bulkUpdateDevices as jest.Mock).mockResolvedValue({
      success: true,
      processed_count: 1,
      failed_count: 0,
      errors: [],
      message: "已更新",
    });

    render(<DeviceManagementView />);

    fireEvent.click(screen.getByRole("button", { name: "选择第一行" }));
    fireEvent.click(screen.getByRole("button", { name: "批量更新" }));
    fireEvent.click(screen.getByRole("button", { name: "提交批量更新" }));

    await waitFor(() => {
      expect(bulkUpdateDevices).toHaveBeenCalledWith({
        device_ids: [1],
        updates: { location: "机房-Z" },
      });
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("已更新"),
      expect.objectContaining({ duration: expect.any(Number) }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining("成功：1 台"),
      expect.objectContaining({ duration: expect.any(Number) }),
    );
  });

  it("从 URL search 参数初始化搜索词后，应在防抖后触发后端请求", async () => {
    jest.useFakeTimers();
    mockSearchParams = new URLSearchParams("search=edge");

    render(<DeviceManagementView />);

    // 先让初次请求完成（不关心参数）
    await waitFor(() => {
      expect(mockLoadDevices).toHaveBeenCalled();
    });

    // 搜索词写入筛选后，防抖 350ms 才会触发真正请求
    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLoadDevices).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: "edge",
        }),
      );
    });
  });
});
