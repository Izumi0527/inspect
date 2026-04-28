import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { DeviceDetailsModal } from "@/features/devices/components/modals/DeviceDetailsModal";
import {
  healthCheckDevice,
  fetchDevicePerformance,
  fetchDeviceSNMPExtensions,
} from "@/features/devices/api/devices.api";

jest.mock("@/features/devices/api/devices.api", () => ({
  healthCheckDevice: jest.fn(),
  fetchDevicePerformance: jest.fn(),
  fetchDeviceSNMPExtensions: jest.fn(),
}));

jest.mock("@/components/atoms", () => ({
  SimpleModal: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    ) : null,
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
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
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <select
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <>{placeholder}</>
  ),
}));

jest.mock("@/utils/formatters", () => ({
  formatDate: (value: string) => value,
}));

describe("DeviceDetailsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchDeviceSNMPExtensions as jest.Mock).mockResolvedValue({
      device_id: 1,
      timestamp: null,
      bgp_peers: [],
      optical_transceivers: [],
    });
  });

  it("应脱敏展示凭据状态，并支持健康检查与性能加载", async () => {
    (healthCheckDevice as jest.Mock).mockResolvedValue({
      status: "online",
      icmp_reachable: true,
      snmp_reachable: true,
      probed_at: "2026-03-09T10:00:00Z",
    });
    (fetchDevicePerformance as jest.Mock).mockResolvedValue({
      current: {
        cpu_usage: 32.5,
        memory_usage: 45.2,
      },
      history: [
        {
          timestamp: "2026-03-09T09:00:00Z",
          metric_name: "cpu_usage",
          value: 30,
        },
      ],
    });

    render(
      <DeviceDetailsModal
        isOpen={true}
        loading={false}
        onClose={jest.fn()}
        device={{
          id: 1,
          name: "edge-01",
          ip: "10.0.0.7",
          device_type: "router",
          status: "online",
          location: "机房-A",
          last_seen: "2026-03-09T09:59:00Z",
          uptime: "3600",
          alert_count: 2,
          cli_protocol: "ssh",
          ssh_username: "netops",
          ssh_config: {
            username: "netops",
            port: 2222,
            password_configured: true,
            private_key_configured: false,
          },
          snmp_config: {
            version: "v2c",
            port: 1161,
            v2c_config: {
              community: "",
              write_community: "",
              community_configured: true,
              write_community_configured: false,
            },
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchDevicePerformance).toHaveBeenCalledWith(1, "24h");
    });
    await waitFor(() => {
      expect(fetchDeviceSNMPExtensions).toHaveBeenCalledWith(1);
    });

    const snmpCredentialRow = screen.getByText("SNMP 凭据状态").closest("div");
    const cliCredentialRow = screen.getByText("CLI 凭据状态").closest("div");

    expect(snmpCredentialRow).not.toBeNull();
    expect(cliCredentialRow).not.toBeNull();
    expect(
      within(snmpCredentialRow as HTMLElement).getByText("已配置"),
    ).toBeInTheDocument();
    expect(
      within(cliCredentialRow as HTMLElement).getByText("已配置"),
    ).toBeInTheDocument();
    expect(screen.queryByText("secret-password")).not.toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "执行健康检查" }));

    await waitFor(() => {
      expect(healthCheckDevice).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ updateStatus: true }),
      );
    });

    const currentCpuRow = screen.getByText("当前 CPU").closest("div");
    const currentMemoryRow = screen.getByText("当前内存").closest("div");

    expect(currentCpuRow).not.toBeNull();
    expect(currentMemoryRow).not.toBeNull();
    expect(
      within(currentCpuRow as HTMLElement).getByText("32.5%"),
    ).toBeInTheDocument();
    expect(
      within(currentMemoryRow as HTMLElement).getByText("45.2%"),
    ).toBeInTheDocument();
  });

  it("存在 SNMP 扩展摘要时应展示 BGP 与光模块信息", async () => {
    (fetchDevicePerformance as jest.Mock).mockResolvedValue({
      current: {
        cpu_usage: 22.5,
        memory_usage: 35.2,
      },
      history: [],
    });
    (fetchDeviceSNMPExtensions as jest.Mock).mockResolvedValue({
      device_id: 9,
      timestamp: "2026-04-29T08:30:00Z",
      bgp_peers: [
        {
          index: "1",
          state_label: "established",
          established_time_seconds: 3600,
        },
      ],
      optical_transceivers: [
        {
          index: "10",
          bias_current: 12.5,
          bias_current_unit: "uA",
          rx_power: 2.3,
          rx_power_unit: "uW",
        },
      ],
    });

    render(
      <DeviceDetailsModal
        isOpen={true}
        loading={false}
        onClose={jest.fn()}
        device={{
          id: 9,
          name: "core-09",
          ip: "10.0.0.19",
          device_type: "router",
          status: "online",
          location: "机房-C",
          last_seen: "2026-04-29T08:29:00Z",
          uptime: "3600",
          alert_count: 0,
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchDeviceSNMPExtensions).toHaveBeenCalledWith(9);
    });

    expect(screen.getByText("SNMP 扩展摘要")).toBeInTheDocument();
    expect(screen.getByText("BGP 邻居数")).toBeInTheDocument();
    expect(screen.getByText("光模块数量")).toBeInTheDocument();
    expect(screen.getByText("established")).toBeInTheDocument();
    expect(screen.getByText("3600 秒")).toBeInTheDocument();
    expect(screen.getByText("12.5 uA")).toBeInTheDocument();
    expect(screen.getByText("2.3 uW")).toBeInTheDocument();
  });

  it("切换性能时间范围后应重新请求并展示新时间范围数据", async () => {
    (fetchDevicePerformance as jest.Mock)
      .mockResolvedValueOnce({
        current: {
          cpu_usage: 22.5,
          memory_usage: 35.2,
        },
        history: [
          {
            timestamp: "2026-03-09T09:00:00Z",
            metric_name: "cpu_usage",
            value: 22.5,
          },
        ],
      })
      .mockResolvedValueOnce({
        current: {
          cpu_usage: 51.8,
          memory_usage: 61.4,
        },
        history: [
          {
            timestamp: "2026-03-03T09:00:00Z",
            metric_name: "cpu_usage",
            value: 51.8,
          },
          {
            timestamp: "2026-03-04T09:00:00Z",
            metric_name: "cpu_usage",
            value: 47.2,
          },
        ],
      });

    render(
      <DeviceDetailsModal
        isOpen={true}
        loading={false}
        onClose={jest.fn()}
        device={{
          id: 3,
          name: "edge-03",
          ip: "10.0.0.9",
          device_type: "router",
          status: "online",
          location: "机房-B",
          last_seen: "2026-03-09T09:59:00Z",
          uptime: "3600",
          alert_count: 1,
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchDevicePerformance).toHaveBeenCalledWith(3, "24h");
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "7d" },
    });

    await waitFor(() => {
      expect(fetchDevicePerformance).toHaveBeenCalledWith(3, "7d");
    });

    const currentCpuRow = screen.getByText("当前 CPU").closest("div");
    const currentMemoryRow = screen.getByText("当前内存").closest("div");
    const historyCountRow = screen.getByText("性能点数").closest("div");

    expect(currentCpuRow).not.toBeNull();
    expect(currentMemoryRow).not.toBeNull();
    expect(historyCountRow).not.toBeNull();
    expect(
      within(currentCpuRow as HTMLElement).getByText("51.8%"),
    ).toBeInTheDocument();
    expect(
      within(currentMemoryRow as HTMLElement).getByText("61.4%"),
    ).toBeInTheDocument();
    expect(within(historyCountRow as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("当性能数据缺失时，应展示未知而不是 0.0%", async () => {
    (fetchDevicePerformance as jest.Mock).mockResolvedValue({
      current: {},
      history: [],
    });

    render(
      <DeviceDetailsModal
        isOpen={true}
        loading={false}
        onClose={jest.fn()}
        device={{
          id: 2,
          name: "edge-02",
          ip: "10.0.0.8",
          device_type: "switch",
          status: "offline",
          location: "",
          last_seen: "",
          uptime: "",
          alert_count: 0,
        }}
      />,
    );

    await waitFor(() => {
      expect(fetchDevicePerformance).toHaveBeenCalledWith(2, "24h");
    });

    const currentCpuRow = screen.getByText("当前 CPU").closest("div");
    const currentMemoryRow = screen.getByText("当前内存").closest("div");

    expect(currentCpuRow).not.toBeNull();
    expect(currentMemoryRow).not.toBeNull();
    expect(within(currentCpuRow as HTMLElement).getByText("-")).toBeInTheDocument();
    expect(
      within(currentMemoryRow as HTMLElement).getByText("-"),
    ).toBeInTheDocument();
    expect(
      within(currentCpuRow as HTMLElement).queryByText("0.0%"),
    ).not.toBeInTheDocument();
  });
});
