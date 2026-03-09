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

const mockLoadDevices = jest.fn();
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

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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
  }: {
    isOpen: boolean;
    title: string;
    description: string;
  }) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        <div>{description}</div>
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
  }: {
    isOpen: boolean;
    selectedDevices: Array<{ id: number; name: string }>;
  }) =>
    isOpen ? (
      <div>
        <div>批量更新设备弹窗</div>
        {selectedDevices.map((device) => (
          <div key={device.id}>{device.name}</div>
        ))}
      </div>
    ) : null,
}));

jest.mock("@/features/devices/components/AddDeviceModal", () => ({
  AddDeviceModal: () => null,
}));

jest.mock("@/features/devices/components/DeviceDetailsModal", () => ({
  DeviceDetailsModal: () => null,
}));

jest.mock("@/features/devices/components/EditDeviceModal", () => ({
  EditDeviceModal: () => null,
}));

jest.mock("@/features/devices/hooks/useDevices", () => {
  const React = require("react");

  return {
    useDevices: () => ({
      devices: mockDevices,
      total: mockDevices.length,
      loading: false,
      error: null,
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
    mockDevices = [createMockDevice(1)];
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
});
