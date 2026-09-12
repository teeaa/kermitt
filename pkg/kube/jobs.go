package kube

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// TriggerCronJob creates a new manual batchv1.Job from an existing CronJob template.
func TriggerCronJob(ctx context.Context, clientset kubernetes.Interface, namespace, cronJobName string) (*batchv1.Job, error) {
	if clientset == nil {
		return nil, fmt.Errorf("kubernetes clientset is nil")
	}
	if namespace == "" || cronJobName == "" {
		return nil, fmt.Errorf("namespace and cronJobName must not be empty")
	}

	cronJob, err := clientset.BatchV1().CronJobs(namespace).Get(ctx, cronJobName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get cronjob %s/%s: %w", namespace, cronJobName, err)
	}

	newJobName := GenerateJobName(cronJobName, "manual", time.Now().Unix())

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      newJobName,
			Namespace: namespace,
			Annotations: map[string]string{
				"cronjob.kubernetes.io/instantiate": "manual",
			},
			Labels: make(map[string]string),
		},
		Spec: *cronJob.Spec.JobTemplate.Spec.DeepCopy(),
	}

	// Copy annotations from CronJob template
	for k, v := range cronJob.Spec.JobTemplate.Annotations {
		job.Annotations[k] = v
	}
	job.Annotations["cronjob.kubernetes.io/instantiate"] = "manual"

	// Copy labels from CronJob template
	for k, v := range cronJob.Spec.JobTemplate.Labels {
		job.Labels[k] = v
	}

	createdJob, err := clientset.BatchV1().Jobs(namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		slog.Error("[JOBS] Failed to trigger manual run for cronjob", "cronjob", cronJobName, "newJob", newJobName, "error", err)
		return nil, fmt.Errorf("failed to create job %s/%s: %w", namespace, newJobName, err)
	}

	slog.Info("[JOBS] Triggered manual run for cronjob", "cronjob", cronJobName, "newJob", newJobName)
	return createdJob, nil
}

// RerunJob clones an existing batchv1.Job and creates a new one, stripping controller UID and selectors.
func RerunJob(ctx context.Context, clientset kubernetes.Interface, namespace, jobName string) (*batchv1.Job, error) {
	if clientset == nil {
		return nil, fmt.Errorf("kubernetes clientset is nil")
	}
	if namespace == "" || jobName == "" {
		return nil, fmt.Errorf("namespace and jobName must not be empty")
	}

	origJob, err := clientset.BatchV1().Jobs(namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get job %s/%s: %w", namespace, jobName, err)
	}

	newJobName := GenerateJobName(jobName, "rerun", time.Now().Unix())

	newJob := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:        newJobName,
			Namespace:   namespace,
			Labels:      make(map[string]string),
			Annotations: make(map[string]string),
		},
		Spec: *origJob.Spec.DeepCopy(),
	}

	// CRITICAL: Strip immutable selectors and controller UIDs
	newJob.Spec.Selector = nil
	if newJob.Spec.Template.Labels != nil {
		delete(newJob.Spec.Template.Labels, "controller-uid")
		delete(newJob.Spec.Template.Labels, "batch.kubernetes.io/controller-uid")
		delete(newJob.Spec.Template.Labels, "job-name")
		delete(newJob.Spec.Template.Labels, "batch.kubernetes.io/job-name")
	}

	// Copy user labels, omitting controller tracking
	for k, v := range origJob.Labels {
		if k != "controller-uid" && k != "batch.kubernetes.io/controller-uid" && k != "job-name" && k != "batch.kubernetes.io/job-name" {
			newJob.Labels[k] = v
		}
	}

	// Copy user annotations
	for k, v := range origJob.Annotations {
		newJob.Annotations[k] = v
	}

	createdJob, err := clientset.BatchV1().Jobs(namespace).Create(ctx, newJob, metav1.CreateOptions{})
	if err != nil {
		slog.Error("[JOBS] Failed to create rerun job", "sourceJob", jobName, "newJob", newJobName, "error", err)
		return nil, fmt.Errorf("failed to create job %s/%s: %w", namespace, newJobName, err)
	}

	slog.Info("[JOBS] Cloned and rerun job", "sourceJob", jobName, "newJob", newJobName)
	return createdJob, nil
}

// GenerateJobName builds a DNS-1123 compliant Job name truncated to at most 63 characters.
func GenerateJobName(baseName, action string, timestamp int64) string {
	suffix := fmt.Sprintf("-%s-%d", action, timestamp)
	maxBaseLen := 63 - len(suffix)
	if maxBaseLen < 1 {
		maxBaseLen = 1
	}

	// Strip prior -rerun-xxx or -manual-xxx suffixes if re-running or triggering repeatedly
	trimmed := baseName
	if idx := strings.LastIndex(trimmed, "-rerun-"); idx != -1 {
		trimmed = trimmed[:idx]
	} else if idx := strings.LastIndex(trimmed, "-manual-"); idx != -1 {
		trimmed = trimmed[:idx]
	}

	if len(trimmed) > maxBaseLen {
		trimmed = trimmed[:maxBaseLen]
	}
	trimmed = strings.TrimRight(trimmed, "-")
	if trimmed == "" {
		trimmed = "job"
	}
	return trimmed + suffix
}

// TriggerCronJob delegates to TriggerCronJob using the ClientManager's active Clientset.
func (cm *ClientManager) TriggerCronJob(ctx context.Context, namespace, cronJobName string) (*batchv1.Job, error) {
	clientset, err := cm.GetClientset()
	if err != nil {
		return nil, fmt.Errorf("failed to get clientset: %w", err)
	}
	return TriggerCronJob(ctx, clientset, namespace, cronJobName)
}

// RerunJob delegates to RerunJob using the ClientManager's active Clientset.
func (cm *ClientManager) RerunJob(ctx context.Context, namespace, jobName string) (*batchv1.Job, error) {
	clientset, err := cm.GetClientset()
	if err != nil {
		return nil, fmt.Errorf("failed to get clientset: %w", err)
	}
	return RerunJob(ctx, clientset, namespace, jobName)
}
