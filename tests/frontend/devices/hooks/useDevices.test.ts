import { act, renderHook, waitFor } from "@testing-library/react";

import { useDevices } from "@/features/devices/hooks/useDevices";

const mockFetchDevices = jest.fn();

jest.mock("@/features/devices/api/devices.api", () => ({
  fetchDevices: (...args: unknown[]) => mockFetchDevices(...args),
  createDevice: jest.fn(),
  deleteDevice: jest.fn(),
  bulkDeviceAction: jest.fn(),
  bulkImportDevices: jest.fn(),
}));

describe("useDevices", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("应忽略过期列表请求的返回结果，避免旧数据覆盖新筛选结果", async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;

    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    mockFetchDevices
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result } = renderHook(() => useDevices(false));

    await act(async () => {
      void result.current.loadDevices({
        page: 1,
        page_size: 10,
        search: "core",
        searchQuery: "",
        statusFilter: "all",
        typeFilter: "all",
      });
      void result.current.loadDevices({
        page: 1,
        page_size: 10,
        search: "edge",
        searchQuery: "",
        statusFilter: "all",
        typeFilter: "all",
      });
    });

    await act(async () => {
      resolveSecond({
        devices: [
          {
            id: 2,
            name: "edge-01",
            ip: "10.0.0.2",
            device_type: "router",
            status: "online",
            location: "B区",
            last_seen: "2026-03-10T00:00:00Z",
            uptime: "3600",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      await secondPromise;
    });

    await waitFor(() => {
      expect(result.current.devices[0]?.name).toBe("edge-01");
      expect(result.current.total).toBe(1);
    });

    await act(async () => {
      resolveFirst({
        devices: [
          {
            id: 1,
            name: "core-01",
            ip: "10.0.0.1",
            device_type: "switch",
            status: "online",
            location: "A区",
            last_seen: "2026-03-10T00:00:00Z",
            uptime: "7200",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });
      await firstPromise;
    });

    expect(result.current.devices[0]?.name).toBe("edge-01");
    expect(result.current.total).toBe(1);
  });
});
