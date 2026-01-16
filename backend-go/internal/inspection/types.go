package inspection

const (
	StatusPending   = "pending"
	StatusRunning   = "running"
	StatusCompleted = "completed"
	StatusFailed    = "failed"
	StatusCancelled = "cancelled"
	StatusTimeout   = "timeout"
)

const (
	TriggerManual    = "manual"
	TriggerScheduled = "scheduled"
	TriggerAlert     = "alert"
)

const (
	StrategyManual    = "manual"
	StrategyScheduled = "scheduled"
)

