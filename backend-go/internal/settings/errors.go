package settings

// NotImplementedError 表示当前版本暂不支持的能力（用于避免“假成功/静默忽略”）。
// handler 可据此映射为 501 Not Implemented。
type NotImplementedError struct {
	Message string
}

func (e NotImplementedError) Error() string {
	return e.Message
}

