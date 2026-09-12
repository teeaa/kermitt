package kube

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// GetControllerPods finds all active matching pods belonging to a controller (Deployment, StatefulSet, DaemonSet, Job, or Pod).
func GetControllerPods(ctx context.Context, clientset kubernetes.Interface, namespace, kind, name string) ([]corev1.Pod, error) {
	if clientset == nil {
		return nil, fmt.Errorf("kubernetes clientset is nil")
	}
	if namespace == "" || kind == "" || name == "" {
		return nil, fmt.Errorf("namespace, kind, and name must not be empty")
	}

	var labelSelector *metav1.LabelSelector
	normalizedKind := strings.ToLower(strings.TrimSpace(kind))

	switch normalizedKind {
	case "deployment", "deployments", "deploy":
		dep, err := clientset.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to get deployment %s/%s: %w", namespace, name, err)
		}
		labelSelector = dep.Spec.Selector

	case "statefulset", "statefulsets", "sts":
		sts, err := clientset.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to get statefulset %s/%s: %w", namespace, name, err)
		}
		labelSelector = sts.Spec.Selector

	case "daemonset", "daemonsets", "ds":
		ds, err := clientset.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to get daemonset %s/%s: %w", namespace, name, err)
		}
		labelSelector = ds.Spec.Selector

	case "job", "jobs":
		job, err := clientset.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to get job %s/%s: %w", namespace, name, err)
		}
		labelSelector = job.Spec.Selector
		if labelSelector == nil {
			labelSelector = &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"job-name": name,
				},
			}
		}

	case "pod", "pods":
		pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return nil, fmt.Errorf("failed to get pod %s/%s: %w", namespace, name, err)
		}
		return []corev1.Pod{*pod}, nil

	default:
		return nil, fmt.Errorf("unsupported workload kind: %q (expected Deployment, StatefulSet, DaemonSet, Job, or Pod)", kind)
	}

	var selectorStr string
	if labelSelector != nil {
		sel, err := metav1.LabelSelectorAsSelector(labelSelector)
		if err != nil {
			return nil, fmt.Errorf("failed to parse label selector for %s %s/%s: %w", kind, namespace, name, err)
		}
		selectorStr = sel.String()
	}

	podList, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: selectorStr,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods for %s %s/%s: %w", kind, namespace, name, err)
	}

	// Filter active matching pods:
	// If any pods are active (DeletionTimestamp == nil), prefer those over terminating pods.
	activePods := make([]corev1.Pod, 0, len(podList.Items))
	for _, p := range podList.Items {
		if p.DeletionTimestamp == nil {
			activePods = append(activePods, p)
		}
	}
	if len(activePods) == 0 {
		return podList.Items, nil
	}

	return activePods, nil
}
