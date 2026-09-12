package kube

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
)

// PodMetricsUsage contains aggregated live CPU and Memory utilization for a pod.
type PodMetricsUsage struct {
	CPUUsage    string // e.g. "45m"
	MemoryUsage string // e.g. "128Mi"
}

// FetchPodMetrics attempts to query metrics.k8s.io for all pods in the given namespace.
// If metrics-server is not installed, unreachable, or returns an error, it gracefully returns an empty map without error.
func FetchPodMetrics(ctx context.Context, metricsClient *metricsv1beta1.Clientset, namespace string) (map[string]PodMetricsUsage, error) {
	if metricsClient == nil {
		return nil, nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	targetNs := namespace
	if targetNs == "all" || targetNs == "" || targetNs == "*" {
		targetNs = metav1.NamespaceAll
	}

	metricsList, err := metricsClient.MetricsV1beta1().PodMetricses(targetNs).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Warn("[METRICS] metrics.k8s.io not available or failed", "namespace", targetNs, "error", err)
		return nil, nil
	}

	result := make(map[string]PodMetricsUsage, len(metricsList.Items))
	for _, item := range metricsList.Items {
		var totalCPU resource.Quantity
		var totalMem resource.Quantity

		for _, c := range item.Containers {
			totalCPU.Add(c.Usage[corev1.ResourceCPU])
			totalMem.Add(c.Usage[corev1.ResourceMemory])
		}

		key := fmt.Sprintf("%s/%s", item.Namespace, item.Name)
		result[key] = PodMetricsUsage{
			CPUUsage:    FormatCPU(totalCPU),
			MemoryUsage: FormatMemory(totalMem),
		}
	}

	return result, nil
}

// CalculateContainerResources sums CPU and Memory requests and limits across all containers of a pod.
func CalculateContainerResources(containers []corev1.Container) (cpuReq, cpuLim, memReq, memLim string) {
	var totalCPUReq resource.Quantity
	var totalCPULim resource.Quantity
	var totalMemReq resource.Quantity
	var totalMemLim resource.Quantity

	for _, c := range containers {
		if req := c.Resources.Requests; req != nil {
			if cpu := req.Cpu(); cpu != nil && !cpu.IsZero() {
				totalCPUReq.Add(*cpu)
			}
			if mem := req.Memory(); mem != nil && !mem.IsZero() {
				totalMemReq.Add(*mem)
			}
		}
		if lim := c.Resources.Limits; lim != nil {
			if cpu := lim.Cpu(); cpu != nil && !cpu.IsZero() {
				totalCPULim.Add(*cpu)
			}
			if mem := lim.Memory(); mem != nil && !mem.IsZero() {
				totalMemLim.Add(*mem)
			}
		}
	}

	if !totalCPUReq.IsZero() {
		cpuReq = FormatCPU(totalCPUReq)
	}
	if !totalCPULim.IsZero() {
		cpuLim = FormatCPU(totalCPULim)
	}
	if !totalMemReq.IsZero() {
		memReq = FormatMemory(totalMemReq)
	}
	if !totalMemLim.IsZero() {
		memLim = FormatMemory(totalMemLim)
	}

	return cpuReq, cpuLim, memReq, memLim
}

// FormatCPU formats a resource.Quantity into millicores ("45m") or whole cores ("1" / "1.5").
func FormatCPU(q resource.Quantity) string {
	if q.IsZero() {
		return ""
	}
	millis := q.MilliValue()
	if millis < 1000 {
		return fmt.Sprintf("%dm", millis)
	}
	if millis%1000 == 0 {
		return fmt.Sprintf("%d", millis/1000)
	}
	return fmt.Sprintf("%.2f", float64(millis)/1000.0)
}

// FormatMemory formats a resource.Quantity into MiB ("128Mi") or GiB ("1.5Gi").
func FormatMemory(q resource.Quantity) string {
	if q.IsZero() {
		return ""
	}
	bytesVal := q.Value()
	const mib = 1024 * 1024
	const gib = 1024 * 1024 * 1024

	if bytesVal < gib {
		mbVal := float64(bytesVal) / float64(mib)
		if mbVal == float64(int64(mbVal)) {
			return fmt.Sprintf("%dMi", int64(mbVal))
		}
		return fmt.Sprintf("%.1fMi", mbVal)
	}

	gbVal := float64(bytesVal) / float64(gib)
	if gbVal == float64(int64(gbVal)) {
		return fmt.Sprintf("%dGi", int64(gbVal))
	}
	return fmt.Sprintf("%.1fGi", gbVal)
}
