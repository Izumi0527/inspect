package devices_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

func TestRoleFromDeviceName(t *testing.T) {
	cases := []struct {
		name     string
		wantRole string
		wantOK   bool
	}{
		{name: "16F核心交换机", wantRole: devices.TopologyRoleCore, wantOK: true},
		{name: "CORE-SW-01", wantRole: devices.TopologyRoleCore, wantOK: true},
		{name: "16F汇聚交换机", wantRole: devices.TopologyRoleAggregation, wantOK: true},
		{name: "agg-sw-2", wantRole: devices.TopologyRoleAggregation, wantOK: true},
		{name: "DIST-SW", wantRole: devices.TopologyRoleAggregation, wantOK: true},
		{name: "distribution-01", wantRole: devices.TopologyRoleAggregation, wantOK: true},
		{name: "16F接入交换机2", wantRole: devices.TopologyRoleAccess, wantOK: true},
		{name: "ACC-SW-3", wantRole: devices.TopologyRoleAccess, wantOK: true},
		{name: "access-16f", wantRole: devices.TopologyRoleAccess, wantOK: true},
		{name: "16F门禁交换机", wantRole: "", wantOK: false},
		{name: "accounting-sw", wantRole: "", wantOK: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			role, ok := devices.RoleFromDeviceName(tc.name)
			if ok != tc.wantOK || role != tc.wantRole {
				t.Fatalf("RoleFromDeviceName(%q) = (%q, %v), want (%q, %v)", tc.name, role, ok, tc.wantRole, tc.wantOK)
			}
		})
	}
}

func TestInferTopologyRoles_ThreeStepAndDualCoreAndPeerResolution(t *testing.T) {
	t.Run("类型定型且采集类型优先", func(t *testing.T) {
		devs := []devices.TopologyRoleDevice{
			{ID: 1, Name: "fw", DeviceType: "firewall"},
			{ID: 2, Name: "r1", DeviceType: "switch", DetectedDeviceType: "router"},
			{ID: 3, Name: "ap1", DeviceType: "ap"},
		}
		roles := devices.InferTopologyRoles(devs, nil)
		if roles[1] != (devices.TopologyRoleResult{Role: devices.TopologyRoleFirewall, Source: devices.TopologyRoleSourceType}) {
			t.Fatalf("dev 1 = %+v", roles[1])
		}
		if roles[2] != (devices.TopologyRoleResult{Role: devices.TopologyRoleRouter, Source: devices.TopologyRoleSourceType}) {
			t.Fatalf("dev 2 = %+v", roles[2])
		}
		if roles[3] != (devices.TopologyRoleResult{Role: devices.TopologyRoleEdge, Source: devices.TopologyRoleSourceType}) {
			t.Fatalf("dev 3 = %+v", roles[3])
		}
	})

	t.Run("双核心并列与汇聚叶子推断", func(t *testing.T) {
		devs := []devices.TopologyRoleDevice{
			{ID: 1, Name: "sw-a", DeviceType: "switch", IP: "10.0.0.1"},
			{ID: 2, Name: "sw-b", DeviceType: "switch", IP: "10.0.0.2", Hostname: "host-b"},
			{ID: 3, Name: "sw-c", DeviceType: "switch", IP: "10.0.0.3", DetectedSysName: "SYS-C"},
			{ID: 4, Name: "sw-d", DeviceType: "switch", IP: "10.0.0.4", MAC: "00:11:22:33:44:04"},
			{ID: 5, Name: "sw-e", DeviceType: "switch", IP: "10.0.0.5", DetectedChassisID: "0011.2233.4405"},
		}
		neighbors := []devices.TopologyRoleNeighbor{
			// 1 连 2(IP)、3(DetectedSysName)、4(MAC) -> 度 3
			{DeviceID: 1, RemoteMgmtIP: "10.0.0.2"},
			{DeviceID: 1, RemoteSysName: "sys-c"},
			{DeviceID: 1, RemoteChassisID: "00-11-22-33-44-04"},
			// 重复半链路与自环、未纳管邻居应忽略/去重
			{DeviceID: 1, RemoteMgmtIP: "10.0.0.1"},
			{DeviceID: 1, RemoteMgmtIP: "10.0.0.2"},
			{DeviceID: 1, RemoteMgmtIP: "192.168.99.99"},
			// 2 连 3(IP)、5(DetectedChassisID) -> 度 3 (含 1->2 反向)
			{DeviceID: 2, RemoteMgmtIP: "10.0.0.3"},
			{DeviceID: 2, RemoteChassisID: "00:11:22:33:44:05"},
		}

		roles := devices.InferTopologyRoles(devs, neighbors)
		want := map[int]devices.TopologyRoleResult{
			1: {Role: devices.TopologyRoleCore, Source: devices.TopologyRoleSourceInferred},
			2: {Role: devices.TopologyRoleCore, Source: devices.TopologyRoleSourceInferred},
			3: {Role: devices.TopologyRoleAggregation, Source: devices.TopologyRoleSourceInferred},
			4: {Role: devices.TopologyRoleAccess, Source: devices.TopologyRoleSourceInferred},
			5: {Role: devices.TopologyRoleAccess, Source: devices.TopologyRoleSourceInferred},
		}
		for id, w := range want {
			if roles[id] != w {
				t.Fatalf("dev %d role = %+v, want %+v", id, roles[id], w)
			}
		}
	})

	t.Run("名称层级优先级与分量已有核心降级汇聚", func(t *testing.T) {
		devs := []devices.TopologyRoleDevice{
			{ID: 1, Name: "核心交换机", DeviceType: "switch", IP: "10.1.0.1"},
			{ID: 2, Name: "sw-mid", DeviceType: "switch", IP: "10.1.0.2"},
			{ID: 3, Name: "sw-leaf-1", DeviceType: "switch", IP: "10.1.0.3"},
			{ID: 4, Name: "sw-leaf-2", DeviceType: "switch", IP: "10.1.0.4"},
			{ID: 5, Name: "lonely-sw", DeviceType: "switch", IP: "10.1.0.5"},
		}
		neighbors := []devices.TopologyRoleNeighbor{
			{DeviceID: 1, RemoteMgmtIP: "10.1.0.2"},
			{DeviceID: 2, RemoteMgmtIP: "10.1.0.3"},
			{DeviceID: 2, RemoteMgmtIP: "10.1.0.4"},
		}
		roles := devices.InferTopologyRoles(devs, neighbors)
		if roles[1] != (devices.TopologyRoleResult{Role: devices.TopologyRoleCore, Source: devices.TopologyRoleSourceName}) {
			t.Fatalf("dev 1 = %+v", roles[1])
		}
		if roles[2] != (devices.TopologyRoleResult{Role: devices.TopologyRoleAggregation, Source: devices.TopologyRoleSourceInferred}) {
			t.Fatalf("dev 2 = %+v", roles[2])
		}
		if roles[5] != (devices.TopologyRoleResult{Role: devices.TopologyRoleAccess, Source: devices.TopologyRoleSourceInferred}) {
			t.Fatalf("dev 5 = %+v", roles[5])
		}
	})

	t.Run("名称与MAC分轮建索引防止ID小者采集值抢占台账名", func(t *testing.T) {
		devs := []devices.TopologyRoleDevice{
			{ID: 1, Name: "sw-1", DetectedSysName: "SW-MAIN", DeviceType: "switch"},
			{ID: 2, Name: "SW-MAIN", DeviceType: "switch"},
			{ID: 3, Name: "sw-3", DeviceType: "switch"},
		}
		neighbors := []devices.TopologyRoleNeighbor{
			{DeviceID: 2, RemoteSysName: "sw-3"},
			{DeviceID: 3, RemoteSysName: "SW-MAIN"},
		}
		roles := devices.InferTopologyRoles(devs, neighbors)
		// 1 号未连接度为 0 -> access；2 与 3 互连形成分量且均度为 1 -> access
		if roles[1].Role != devices.TopologyRoleAccess || roles[2].Role != devices.TopologyRoleAccess {
			t.Fatalf("unexpected roles: %+v", roles)
		}
	})
}

func TestInferSingleDeviceTopologyRole(t *testing.T) {
	cases := []struct {
		name         string
		deviceType   string
		detectedType string
		devName      string
		fallback     string
		want         devices.TopologyRoleResult
	}{
		{
			name:         "识别类型优先",
			deviceType:   "switch",
			detectedType: "firewall",
			devName:      "CORE-SW",
			fallback:     "access",
			want:         devices.TopologyRoleResult{Role: devices.TopologyRoleFirewall, Source: devices.TopologyRoleSourceType},
		},
		{
			name:       "交换机按名称回退",
			deviceType: "switch",
			devName:    "16F汇聚交换机",
			fallback:   "access",
			want:       devices.TopologyRoleResult{Role: devices.TopologyRoleAggregation, Source: devices.TopologyRoleSourceName},
		},
		{
			name:       "无关键字规范化fallback",
			deviceType: "switch",
			devName:    "accounting-sw",
			fallback:   "distribution",
			want:       devices.TopologyRoleResult{Role: devices.TopologyRoleAggregation, Source: ""},
		},
		{
			name:     "空类型和非法fallback默认access",
			devName:  "unknown-box",
			fallback: "invalid-role",
			want:     devices.TopologyRoleResult{Role: devices.TopologyRoleAccess, Source: ""},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := devices.InferSingleDeviceTopologyRole(tc.deviceType, tc.detectedType, tc.devName, tc.fallback)
			if got != tc.want {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}
