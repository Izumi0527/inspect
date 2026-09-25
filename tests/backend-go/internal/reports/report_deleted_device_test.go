package reports_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

//go:linkname markDeletedInspectionDevice github.com/your-org/inspect-system/backend-go/internal/reports.markDeletedInspectionDevice
func markDeletedInspectionDevice(device *reports.InspectionDeviceData, deviceID int, identityLost bool)

// 设备已被物理删除、且巡检行没有快照（快照机制上线前的历史行）时，设备身份已无从恢复：
// 报告必须明说「已删除」，而不是一排空白或「-」让人以为是报告故障。
func TestMarkDeletedInspectionDevice_LabelsUnrecoverableIdentity(t *testing.T) {
	device := reports.InspectionDeviceData{LastInspectionTime: "2026-08-22 13:32:59"}

	markDeletedInspectionDevice(&device, 6, true)

	if device.DeviceName != "已删除设备（ID 6）" {
		t.Fatalf("DeviceName = %q", device.DeviceName)
	}
	for label, got := range map[string]string{
		"IPAddress": device.IPAddress, "DeviceType": device.DeviceType, "Vendor": device.Vendor,
		"Model": device.Model, "SoftwareVersion": device.SoftwareVersion, "Uptime": device.Uptime,
	} {
		if got != "设备已删除" {
			t.Fatalf("%s = %q, want 设备已删除", label, got)
		}
	}
	if device.LastInspectionTime != "2026-08-22 13:32:59" {
		t.Fatal("巡检行自身的字段不应被改写")
	}
}

// 有快照（或设备仍在）时身份可还原：字段为空说明巡检那一刻就没采集到，原样保留。
// 否则同一份历史报告在删设备前后内容不同，违背快照「不随删除变化」的初衷。
func TestMarkDeletedInspectionDevice_RecoverableIdentityUntouched(t *testing.T) {
	device := reports.InspectionDeviceData{DeviceName: "core-sw", IPAddress: "192.168.20.1"}

	markDeletedInspectionDevice(&device, 6, false)

	if device.DeviceName != "core-sw" || device.IPAddress != "192.168.20.1" {
		t.Fatalf("快照值被覆盖: %+v", device)
	}
	if device.Model != "" {
		t.Fatalf("Model = %q, 快照缺的字段应保持为空", device.Model)
	}
}
