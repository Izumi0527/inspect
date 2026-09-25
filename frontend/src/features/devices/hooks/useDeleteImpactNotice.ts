import { useEffect, useState } from "react";
import { fetchDeviceInspectionCount } from "../api/devices.api";

/**
 * 删除确认框的附加提示文案。后端删除设备前会把设备身份快照到它的历史巡检行，
 * 报告不再因删设备而变空；这里只负责在删除前如实告知。没有巡检记录时不提示。
 */
export function describeInspectionRetention(count: number, deviceCount: number): string {
  if (count <= 0) return "";
  const subject = deviceCount === 1 ? "该设备有" : "所选设备共有";
  return `${subject} ${count} 条巡检记录，删除后这些记录和巡检报告仍会保留删除时的设备名称、IP 等信息。`;
}

/**
 * 确认框打开（enabled）时查询所选设备的巡检记录数并返回提示文案。
 * 查询失败静默降级为无提示：提示只是告知，不能挡住删除。
 */
export function useDeleteImpactNotice(deviceIds: number[], enabled: boolean): string {
  // 结果与查询时的设备集合绑定：切换设备后旧条数自然失效，不必在 effect 里同步清空。
  const [result, setResult] = useState<{ key: string; count: number } | null>(null);
  const idsKey = deviceIds.join(",");

  useEffect(() => {
    if (!enabled || idsKey === "") return;
    let cancelled = false;
    (async () => {
      try {
        const count = await fetchDeviceInspectionCount(idsKey.split(",").map(Number));
        if (!cancelled) setResult({ key: idsKey, count });
      } catch {
        // 静默降级：确认框按原文案展示
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, idsKey]);

  const count = enabled && result?.key === idsKey ? result.count : 0;
  return describeInspectionRetention(count, deviceIds.length);
}
