import React from "react";
import { render, screen } from "@testing-library/react";

import { BulkDeviceUpdate } from "@/features/devices/components/BulkDeviceUpdate";

const selectedDevices = [
  {
    id: 1,
    name: "edge-01",
    ip: "10.0.0.1",
    device_type: "router" as const,
    status: "online" as const,
    location: "机房A",
    alert_count: 1,
  },
];

describe("BulkDeviceUpdate", () => {
  it("打开时应使用真正的对话框语义渲染，而不是直接铺进页面", () => {
    render(
      <BulkDeviceUpdate
        isOpen
        onClose={jest.fn()}
        selectedDevices={selectedDevices}
        onBulkUpdate={jest.fn().mockResolvedValue(undefined)}
        isProcessing={false}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "批量更新设备" }),
    ).toBeInTheDocument();
    expect(screen.getByText("edge-01")).toBeInTheDocument();
  });
});
