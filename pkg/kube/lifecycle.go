package kube

import (
	"context"
	"fmt"
	"log/slog"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// DeletePod deletes a pod in the specified namespace with an optional grace period.
func DeletePod(ctx context.Context, clientset kubernetes.Interface, namespace, podName string, gracePeriodSeconds *int64) error {
	if clientset == nil {
		return fmt.Errorf("kubernetes clientset is nil")
	}
	if namespace == "" || podName == "" {
		return fmt.Errorf("namespace and podName must not be empty")
	}

	deleteOptions := metav1.DeleteOptions{}
	if gracePeriodSeconds != nil {
		deleteOptions.GracePeriodSeconds = gracePeriodSeconds
	}

	slog.Info("[LIFECYCLE] Deleting pod", "namespace", namespace, "podName", podName, "gracePeriodSeconds", gracePeriodSeconds)
	err := clientset.CoreV1().Pods(namespace).Delete(ctx, podName, deleteOptions)
	if err != nil {
		slog.Error("[LIFECYCLE] Failed to delete pod", "namespace", namespace, "pod", podName, "error", err)
		return fmt.Errorf("failed to delete pod %s/%s: %w", namespace, podName, err)
	}

	slog.Info("[LIFECYCLE] Pod deleted successfully", "namespace", namespace, "pod", podName)
	return nil
}

// RestartPod restarts a pod by initiating standard deletion, prompting managing controllers
// (Deployments, ReplicaSets, StatefulSets, DaemonSets, Jobs) to spin up a new healthy replacement.
func RestartPod(ctx context.Context, clientset kubernetes.Interface, namespace, podName string) error {
	if clientset == nil {
		return fmt.Errorf("kubernetes clientset is nil")
	}
	if namespace == "" || podName == "" {
		return fmt.Errorf("namespace and podName must not be empty")
	}

	// Attempt to inspect owner references to verify if pod is managed by a controller
	pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err == nil && pod != nil && len(pod.OwnerReferences) > 0 {
		slog.Info("[LIFECYCLE] Triggered pod restart",
			"namespace", namespace,
			"pod", podName,
			"ownerKind", pod.OwnerReferences[0].Kind,
			"ownerName", pod.OwnerReferences[0].Name,
		)
	} else {
		slog.Info("[LIFECYCLE] Triggered pod restart", "namespace", namespace, "pod", podName)
	}

	gracePeriod := int64(0)
	deleteOptions := metav1.DeleteOptions{
		GracePeriodSeconds: &gracePeriod,
	}
	err = clientset.CoreV1().Pods(namespace).Delete(ctx, podName, deleteOptions)
	if err != nil {
		slog.Error("[LIFECYCLE] Failed to restart pod", "namespace", namespace, "pod", podName, "error", err)
		return fmt.Errorf("failed to restart pod %s/%s: %w", namespace, podName, err)
	}

	slog.Info("[LIFECYCLE] Pod restart deletion completed successfully", "namespace", namespace, "pod", podName)
	return nil
}

// GetJobLatestPod locates the most recently created pod associated with a batch/v1 Job.
func GetJobLatestPod(ctx context.Context, clientset kubernetes.Interface, namespace, jobName string) (*corev1.Pod, error) {
	if clientset == nil {
		return nil, fmt.Errorf("kubernetes clientset is nil")
	}
	if namespace == "" || jobName == "" {
		return nil, fmt.Errorf("namespace and jobName must not be empty")
	}

	labelSelector := fmt.Sprintf("job-name=%s", jobName)
	podList, err := clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods for job %s/%s: %w", namespace, jobName, err)
	}

	if len(podList.Items) == 0 {
		return nil, fmt.Errorf("no pods found matching job %s/%s", namespace, jobName)
	}

	// Pick the latest pod created
	latest := &podList.Items[0]
	for i := range podList.Items {
		if podList.Items[i].CreationTimestamp.After(latest.CreationTimestamp.Time) {
			latest = &podList.Items[i]
		}
	}

	slog.Debug("[LIFECYCLE] Found latest pod for job", "jobName", jobName, "podName", latest.Name, "namespace", namespace)
	return latest, nil
}
