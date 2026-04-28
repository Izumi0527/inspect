package snmpmib

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed vendor-oids.json
var embeddedRegistry []byte

var (
	defaultRegistry *Registry
	loadOnce        sync.Once
	loadErr         error
)

func DefaultRegistry() (*Registry, error) {
	loadOnce.Do(func() {
		var registry Registry
		loadErr = json.Unmarshal(embeddedRegistry, &registry)
		if loadErr == nil {
			loadErr = registry.Validate()
		}
		if loadErr == nil {
			defaultRegistry = &registry
		}
	})

	return defaultRegistry, loadErr
}
