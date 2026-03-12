package handlers_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	_ "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"gorm.io/datatypes"
)

//go:linkname buildTemplateResponse github.com/your-org/inspect-system/backend-go/internal/http/handlers.buildTemplateResponse
func buildTemplateResponse(template *inspection.Template) map[string]interface{}

func TestBuildTemplateResponse_ShouldDecodeDeviceTypesObject(t *testing.T) {
	template := &inspection.Template{
		DeviceTypes: datatypes.JSON([]byte(`{"vendors":["Huawei"],"device_types":["router","switch"]}`)),
	}

	resp := buildTemplateResponse(template)
	if resp == nil {
		t.Fatalf("resp is nil")
	}

	got, ok := resp["deviceTypes"]
	if !ok {
		t.Fatalf("resp[deviceTypes] missing")
	}

	deviceTypes, ok := got.([]string)
	if !ok {
		t.Fatalf("resp[deviceTypes] type = %T, want []string", got)
	}

	if !stringSliceContains(deviceTypes, "router") {
		t.Fatalf("resp[deviceTypes] = %v, want contains router", deviceTypes)
	}
}

func stringSliceContains(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}

