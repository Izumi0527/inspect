import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { Table } from "@/components/atoms/table";

jest.mock("framer-motion", () => ({
  motion: {
    tr: ({
      children,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableRowElement>>) => (
      <tr {...props}>{children}</tr>
    ),
  },
}));

describe("Table 行选择", () => {
  const data = [{ id: 1, name: "edge-01" }];
  const columns = [{ key: "name", title: "设备名称" }];

  it("存在其他页面已选设备时，页头复选框只应反映当前页勾选状态", () => {
    render(
      <Table
        columns={columns}
        data={data}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: [99],
          onChange: jest.fn(),
        }}
      />,
    );

    const [headerCheckbox] = screen.getAllByRole("checkbox");

    expect(headerCheckbox).not.toBeChecked();
  });

  it("勾选当前页全选时应保留其他页面的已选设备", () => {
    const onChange = jest.fn();

    render(
      <Table
        columns={columns}
        data={data}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: [99],
          onChange,
        }}
      />,
    );

    const [headerCheckbox] = screen.getAllByRole("checkbox");

    fireEvent.click(headerCheckbox);

    expect(onChange).toHaveBeenCalledWith([99, 1], data);
  });
});
