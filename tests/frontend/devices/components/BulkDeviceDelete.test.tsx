import React from "react";
import { render, screen } from "@testing-library/react";

import { BulkDeviceDelete } from "@/features/devices/components/BulkDeviceDelete";

const selectedDevices = [
  {
    id: 1,
    name: "edge-01",
    ip: "10.0.0.1",
    device_type: "router" as const,
    status: "online" as const,
    location: "机房A",
    alert_count: 2,
  },
];

describe("BulkDeviceDelete", () => {
  it("打开时应使用真正的对话框语义渲染，而不是直接铺进页面", () => {
    render(
      <BulkDeviceDelete
        isOpen
        onClose={jest.fn()}
        selectedDevices={selectedDevices}
        onConfirm={jest.fn().mockResolvedValue(undefined)}
        isProcessing={false}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "确认批量删除" }),
    ).toBeInTheDocument();
    expect(screen.getByText("edge-01")).toBeInTheDocument();
  });
});
