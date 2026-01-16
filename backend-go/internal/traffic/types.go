package traffic

type TrafficMetric struct {
	Timestamp            string  `json:"timestamp"`
	DeviceIP             string  `json:"device_ip"`
	Interface            string  `json:"interface"`
	BytesIn              float64 `json:"bytes_in"`
	BytesOut             float64 `json:"bytes_out"`
	PacketsIn            float64 `json:"packets_in"`
	PacketsOut           float64 `json:"packets_out"`
	BandwidthUtilization float64 `json:"bandwidth_utilization"`
	Errors               float64 `json:"errors"`
	Discards             float64 `json:"discards"`
}

type TrafficAnomaly struct {
	Timestamp     string                 `json:"timestamp"`
	DeviceIP      string                 `json:"device_ip"`
	Interface     string                 `json:"interface"`
	AnomalyType   string                 `json:"anomaly_type"`
	Severity      string                 `json:"severity"`
	Description   string                 `json:"description"`
	BaselineValue float64                `json:"baseline_value"`
	CurrentValue  float64                `json:"current_value"`
	Confidence    float64                `json:"confidence"`
	Metadata      map[string]interface{} `json:"metadata"`
}

type TrafficTrend struct {
	DeviceIP           string  `json:"device_ip"`
	Interface          string  `json:"interface"`
	CurrentIn          float64 `json:"current_in"`
	CurrentOut         float64 `json:"current_out"`
	CurrentUtilization float64 `json:"current_utilization"`
	TrendIn            float64 `json:"trend_in"`
	TrendOut           float64 `json:"trend_out"`
	TrendUtilization   float64 `json:"trend_utilization"`
	AvgIn              float64 `json:"avg_in"`
	AvgOut             float64 `json:"avg_out"`
	AvgUtilization     float64 `json:"avg_utilization"`
	PeakIn             float64 `json:"peak_in"`
	PeakOut            float64 `json:"peak_out"`
	PeakUtilization    float64 `json:"peak_utilization"`
}

type TrafficInterfaceSummary struct {
	LastSeen       string  `json:"last_seen"`
	AvgUtilization float64 `json:"avg_utilization"`
	TotalBytes     float64 `json:"total_bytes"`
}

type TrafficDeviceSummary struct {
	Interfaces     map[string]TrafficInterfaceSummary `json:"interfaces"`
	InterfaceCount int                               `json:"interface_count"`
	LastUpdate     string                            `json:"last_update"`
	SampleCount    int                               `json:"sample_count"`
}

type TrafficSummary struct {
	TotalDevices    int                               `json:"total_devices"`
	TotalInterfaces int                               `json:"total_interfaces"`
	ActiveAnomalies int                               `json:"active_anomalies"`
	BaselinePatterns int                              `json:"baseline_patterns"`
	Devices         map[string]TrafficDeviceSummary   `json:"devices"`
}

type TrafficCollectionResponse struct {
	Success     bool           `json:"success"`
	DeviceIP    string         `json:"device_ip"`
	Metrics     []TrafficMetric `json:"metrics"`
	CollectedAt string         `json:"collected_at"`
}

type TrafficAnomaliesResponse struct {
	Success    bool             `json:"success"`
	Anomalies  []TrafficAnomaly `json:"anomalies"`
	TotalCount int              `json:"total_count"`
	QueryParams struct {
		DeviceIP *string `json:"device_ip,omitempty"`
		Severity *string `json:"severity,omitempty"`
		Hours    int     `json:"hours"`
	} `json:"query_params"`
	Timestamp string `json:"timestamp"`
}

type TrafficTrendsResponse struct {
	Success             bool           `json:"success"`
	DeviceIP            string         `json:"device_ip"`
	AnalysisPeriodHours int            `json:"analysis_period_hours"`
	InterfaceTrends     []TrafficTrend `json:"interface_trends"`
	TotalSamples        int            `json:"total_samples"`
	AnalysisTimestamp   string         `json:"analysis_timestamp"`
}

type TrafficMonitoringConfig struct {
	DeviceIPs            []string `json:"device_ips"`
	AnalysisPeriodHours  int      `json:"analysis_period_hours"`
	EnableAnomalyDetection bool   `json:"enable_anomaly_detection"`
	StartedAt            string   `json:"started_at"`
}

type TrafficBaseline struct {
	DeviceIP        string  `json:"device_ip"`
	Interface       string  `json:"interface"`
	Hours           int     `json:"hours"`
	SampleCount     int     `json:"sample_count"`
	AvgIn           float64 `json:"avg_in"`
	AvgOut          float64 `json:"avg_out"`
	AvgUtilization  float64 `json:"avg_utilization"`
	LastSeen        *string `json:"last_seen,omitempty"`
}

type TrafficBaselineResponse struct {
	Success  bool            `json:"success"`
	Baseline TrafficBaseline `json:"baseline"`
}

type NetworkTrafficMetric struct {
	Value      string   `json:"value"`
	Percentage float64  `json:"percentage"`
	Current    float64  `json:"current,omitempty"`
	Peak       float64  `json:"peak,omitempty"`
	Data       []float64 `json:"data,omitempty"`
}

type NetworkTrafficSummaryResponse struct {
	Inbound    NetworkTrafficMetric `json:"inbound"`
	Outbound   NetworkTrafficMetric `json:"outbound"`
	PacketLoss struct {
		Value      string  `json:"value"`
		Percentage float64 `json:"percentage"`
	} `json:"packetLoss"`
	PeakTime *string        `json:"peakTime,omitempty"`
	Summary  *TrafficSummary `json:"summary,omitempty"`
}

type InterfaceTrafficResponse struct {
	InterfaceIndex string  `json:"interface_index"`
	InterfaceName  string  `json:"interface_name"`
	InOctets       int64   `json:"in_octets"`
	OutOctets      int64   `json:"out_octets"`
	InRate         float64 `json:"in_rate"`
	OutRate        float64 `json:"out_rate"`
	Utilization    float64 `json:"utilization"`
	Timestamp      string  `json:"timestamp"`
}

type DeviceTrafficResponse struct {
	DeviceID     int                       `json:"device_id"`
	DeviceName   string                    `json:"device_name"`
	IPAddress    string                    `json:"ip_address"`
	TotalInRate  float64                   `json:"total_in_rate"`
	TotalOutRate float64                   `json:"total_out_rate"`
	Interfaces   []InterfaceTrafficResponse `json:"interfaces"`
	Timestamp    string                    `json:"timestamp"`
}

type TrafficTrendDataPoint struct {
	Timestamp string  `json:"timestamp"`
	InRate    float64 `json:"in_rate"`
	OutRate   float64 `json:"out_rate"`
}

type TrafficTrendResponse struct {
	DeviceID       int                   `json:"device_id"`
	InterfaceIndex *string               `json:"interface_index,omitempty"`
	StartTime      string                `json:"start_time"`
	EndTime        string                `json:"end_time"`
	Interval       string                `json:"interval"`
	DataPoints     []TrafficTrendDataPoint `json:"data_points"`
}

type TopTalkersResponse struct {
	DeviceID     int     `json:"device_id"`
	DeviceName   string  `json:"device_name"`
	IPAddress    string  `json:"ip_address"`
	InterfaceName *string `json:"interface_name,omitempty"`
	InRate       float64 `json:"in_rate"`
	OutRate      float64 `json:"out_rate"`
	TotalRate    float64 `json:"total_rate"`
}

type BandwidthUtilizationResponse struct {
	DeviceID            int     `json:"device_id"`
	DeviceName          string  `json:"device_name"`
	InterfaceIndex      string  `json:"interface_index"`
	InterfaceName       string  `json:"interface_name"`
	Speed               int64   `json:"speed"`
	InUtilization       float64 `json:"in_utilization"`
	OutUtilization      float64 `json:"out_utilization"`
	PeakInUtilization   float64 `json:"peak_in_utilization"`
	PeakOutUtilization  float64 `json:"peak_out_utilization"`
}
