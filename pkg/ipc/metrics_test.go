package ipc

import (
	"testing"

	"github.com/teeaa/kermitt/pkg/kube"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestCalculateContainerResources(t *testing.T) {
	containers := []corev1.Container{
		{
			Name: "app",
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("100m"),
					corev1.ResourceMemory: resource.MustParse("128Mi"),
				},
				Limits: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("500m"),
					corev1.ResourceMemory: resource.MustParse("512Mi"),
				},
			},
		},
		{
			Name: "sidecar",
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("50m"),
					corev1.ResourceMemory: resource.MustParse("64Mi"),
				},
				Limits: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("100m"),
					corev1.ResourceMemory: resource.MustParse("128Mi"),
				},
			},
		},
	}

	cpuReq, cpuLim, memReq, memLim := kube.CalculateContainerResources(containers)

	if cpuReq != "150m" {
		t.Errorf("expected cpuReq '150m', got %q", cpuReq)
	}
	if cpuLim != "600m" {
		t.Errorf("expected cpuLim '600m', got %q", cpuLim)
	}
	if memReq != "192Mi" {
		t.Errorf("expected memReq '192Mi', got %q", memReq)
	}
	if memLim != "640Mi" {
		t.Errorf("expected memLim '640Mi', got %q", memLim)
	}
}

func TestCalculateContainerResources_Empty(t *testing.T) {
	containers := []corev1.Container{
		{Name: "noop"},
	}

	cpuReq, cpuLim, memReq, memLim := kube.CalculateContainerResources(containers)

	if cpuReq != "" || cpuLim != "" || memReq != "" || memLim != "" {
		t.Errorf("expected empty resource limits, got %q, %q, %q, %q", cpuReq, cpuLim, memReq, memLim)
	}
}

func TestFormatCPU(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"0", ""},
		{"45m", "45m"},
		{"500m", "500m"},
		{"1000m", "1"},
		{"1500m", "1.50"},
		{"2", "2"},
	}

	for _, tc := range tests {
		q := resource.MustParse(tc.input)
		got := kube.FormatCPU(q)
		if got != tc.want {
			t.Errorf("FormatCPU(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestFormatMemory(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"0", ""},
		{"128Mi", "128Mi"},
		{"1024Mi", "1Gi"},
		{"1536Mi", "1.5Gi"},
		{"2Gi", "2Gi"},
	}

	for _, tc := range tests {
		q := resource.MustParse(tc.input)
		got := kube.FormatMemory(q)
		if got != tc.want {
			t.Errorf("FormatMemory(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestGetClusterHealthInfo_NilManager(t *testing.T) {
	bridge := NewKubeBridge(nil)
	info, err := bridge.GetClusterHealthInfo()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Status != "disconnected" {
		t.Errorf("expected status 'disconnected', got %q", info.Status)
	}
}
