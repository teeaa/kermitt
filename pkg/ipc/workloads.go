package ipc

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/teeaa/kermitt/pkg/kube"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// GetDeployments returns all deployments in the specified namespace.
// GetDeployments queries clientset.AppsV1().Deployments(ns).List().
func (b *KubeBridge) GetDeployments(namespace string) ([]DeploymentSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetDeployments called", "namespace", ns)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetDeployments(ns); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, d := range cached {
				names = append(names, d.Name)
			}
			slog.Info("GetDeployments returned", "namespace", ns, "count", len(cached), "deployments", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetDeployments: client manager is nil")
		slog.Info("GetDeployments returned", "namespace", ns, "count", 0, "deployments", []string{})
		return make([]DeploymentSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetDeployments failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]DeploymentSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.AppsV1().Deployments(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetDeployments failed: error listing deployments", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]DeploymentSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing deployments in namespace %q", namespace), err.Error(), false)
		}
		return make([]DeploymentSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list deployments in namespace %q", namespace), err.Error(), true)
	}

	res := make([]DeploymentSummary, 0, len(list.Items))
	for _, d := range list.Items {
		totalReplicas := int32(1)
		if d.Spec.Replicas != nil {
			totalReplicas = *d.Spec.Replicas
		}
		readyReplicas := d.Status.ReadyReplicas
		status := "Ready"
		if readyReplicas < totalReplicas {
			if d.Status.UnavailableReplicas > 0 {
				status = "Degraded"
			} else {
				status = "Progressing"
			}
		}
		if totalReplicas == 0 {
			status = "Ready"
		}

		conditions := "Available: True"
		for _, c := range d.Status.Conditions {
			if c.Type == appsv1.DeploymentAvailable && c.Status != corev1.ConditionTrue {
				conditions = fmt.Sprintf("Available: %s (%s)", c.Status, c.Reason)
			}
		}

		res = append(res, DeploymentSummary{
			Name:          d.Name,
			Namespace:     d.Namespace,
			Status:        status,
			Ready:         fmt.Sprintf("%d/%d", readyReplicas, totalReplicas),
			ReadyReplicas: readyReplicas,
			TotalReplicas: totalReplicas,
			UpToDate:      d.Status.UpdatedReplicas,
			Available:     d.Status.AvailableReplicas,
			Age:           FormatAge(d.CreationTimestamp.Time),
			Conditions:    conditions,
		})
	}
	if b.workloadCache != nil {
		b.workloadCache.SetDeployments(ns, res)
	}

	names := make([]string, 0, len(res))
	for _, d := range res {
		names = append(names, d.Name)
	}
	slog.Info("GetDeployments returned", "namespace", ns, "count", len(res), "deployments", names)
	return res, nil
}

// GetStatefulSets returns all statefulsets in the specified namespace.
// GetStatefulSets queries clientset.AppsV1().StatefulSets(ns).List().
func (b *KubeBridge) GetStatefulSets(namespace string) ([]StatefulSetSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetStatefulSets called", "namespace", ns)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetStatefulSets(ns); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, s := range cached {
				names = append(names, s.Name)
			}
			slog.Info("GetStatefulSets returned", "namespace", ns, "count", len(cached), "statefulsets", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetStatefulSets: client manager is nil")
		slog.Info("GetStatefulSets returned", "namespace", ns, "count", 0, "statefulsets", []string{})
		return make([]StatefulSetSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetStatefulSets failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]StatefulSetSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.AppsV1().StatefulSets(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetStatefulSets failed: error listing statefulsets", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]StatefulSetSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing statefulsets in namespace %q", namespace), err.Error(), false)
		}
		return make([]StatefulSetSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list statefulsets in namespace %q", namespace), err.Error(), true)
	}

	res := make([]StatefulSetSummary, 0, len(list.Items))
	for _, s := range list.Items {
		totalReplicas := int32(1)
		if s.Spec.Replicas != nil {
			totalReplicas = *s.Spec.Replicas
		}
		readyReplicas := s.Status.ReadyReplicas
		status := "Ready"
		if readyReplicas < totalReplicas {
			if readyReplicas == 0 && totalReplicas > 0 {
				status = "Degraded"
			} else {
				status = "Progressing"
			}
		}
		if totalReplicas == 0 {
			status = "Ready"
		}

		res = append(res, StatefulSetSummary{
			Name:          s.Name,
			Namespace:     s.Namespace,
			Status:        status,
			Ready:         fmt.Sprintf("%d/%d", readyReplicas, totalReplicas),
			ReadyReplicas: readyReplicas,
			TotalReplicas: totalReplicas,
			Age:           FormatAge(s.CreationTimestamp.Time),
			ServiceName:   s.Spec.ServiceName,
		})
	}
	if b.workloadCache != nil {
		b.workloadCache.SetStatefulSets(ns, res)
	}

	names := make([]string, 0, len(res))
	for _, s := range res {
		names = append(names, s.Name)
	}
	slog.Info("GetStatefulSets returned", "namespace", ns, "count", len(res), "statefulsets", names)
	return res, nil
}

// GetJobs returns all jobs in the specified namespace.
// GetJobs queries clientset.BatchV1().Jobs(ns).List().
func (b *KubeBridge) GetJobs(namespace string) ([]JobSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetJobs called", "namespace", ns)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetJobs(ns); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, j := range cached {
				names = append(names, j.Name)
			}
			slog.Info("GetJobs returned", "namespace", ns, "count", len(cached), "jobs", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetJobs: client manager is nil")
		slog.Info("GetJobs returned", "namespace", ns, "count", 0, "jobs", []string{})
		return make([]JobSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetJobs failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]JobSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.BatchV1().Jobs(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetJobs failed: error listing jobs", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]JobSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing jobs in namespace %q", namespace), err.Error(), false)
		}
		return make([]JobSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list jobs in namespace %q", namespace), err.Error(), true)
	}

	res := make([]JobSummary, 0, len(list.Items))
	for _, j := range list.Items {
		res = append(res, formatJobSummary(&j))
	}
	if b.workloadCache != nil {
		b.workloadCache.SetJobs(ns, res)
	}

	names := make([]string, 0, len(res))
	for _, j := range res {
		names = append(names, j.Name)
	}
	slog.Info("GetJobs returned", "namespace", ns, "count", len(res), "jobs", names)
	return res, nil
}

// GetCronJobs returns all cronjobs in the specified namespace.
// GetCronJobs queries clientset.BatchV1().CronJobs(ns).List().
func (b *KubeBridge) GetCronJobs(namespace string) ([]CronJobSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetCronJobs called", "namespace", ns)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetCronJobs(ns); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, cj := range cached {
				names = append(names, cj.Name)
			}
			slog.Info("GetCronJobs returned", "namespace", ns, "count", len(cached), "cronjobs", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetCronJobs: client manager is nil")
		slog.Info("GetCronJobs returned", "namespace", ns, "count", 0, "cronjobs", []string{})
		return make([]CronJobSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetCronJobs failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]CronJobSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.BatchV1().CronJobs(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetCronJobs failed: error listing cronjobs", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]CronJobSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing cronjobs in namespace %q", namespace), err.Error(), false)
		}
		return make([]CronJobSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list cronjobs in namespace %q", namespace), err.Error(), true)
	}

	res := make([]CronJobSummary, 0, len(list.Items))
	for _, cj := range list.Items {
		suspend := false
		if cj.Spec.Suspend != nil {
			suspend = *cj.Spec.Suspend
		}

		lastSchedule := "-"
		if cj.Status.LastScheduleTime != nil {
			lastSchedule = FormatAge(cj.Status.LastScheduleTime.Time) + " ago"
		}

		res = append(res, CronJobSummary{
			Name:                cj.Name,
			Namespace:           cj.Namespace,
			Schedule:            cj.Spec.Schedule,
			ScheduleDescription: formatScheduleDescription(cj.Spec.Schedule),
			Suspend:             suspend,
			ActiveJobs:          len(cj.Status.Active),
			LastSchedule:        lastSchedule,
			Age:                 FormatAge(cj.CreationTimestamp.Time),
		})
	}
	if b.workloadCache != nil {
		b.workloadCache.SetCronJobs(ns, res)
	}

	names := make([]string, 0, len(res))
	for _, cj := range res {
		names = append(names, cj.Name)
	}
	slog.Info("GetCronJobs returned", "namespace", ns, "count", len(res), "cronjobs", names)
	return res, nil
}

func formatScheduleDescription(schedule string) string {
	switch schedule {
	case "0 * * * *":
		return "Every hour at minute 0"
	case "0 0 * * *":
		return "Every day at midnight"
	case "0 2 * * *":
		return "Every day at 02:00 UTC"
	case "0 0 * * 0":
		return "Every Sunday at midnight"
	case "*/5 * * * *":
		return "Every 5 minutes"
	case "*/15 * * * *":
		return "Every 15 minutes"
	default:
		return fmt.Sprintf("Cron: %s", schedule)
	}
}

// formatJobSummary converts a Kubernetes batchv1.Job to JobSummary.
func formatJobSummary(j *batchv1.Job) JobSummary {
	if j == nil {
		return JobSummary{}
	}
	status := "Running"
	if j.Status.Succeeded > 0 {
		status = "Completed"
	} else if j.Status.Failed > 0 {
		status = "Failed"
	}

	completionsReq := int32(1)
	if j.Spec.Completions != nil {
		completionsReq = *j.Spec.Completions
	}
	completions := fmt.Sprintf("%d/%d", j.Status.Succeeded, completionsReq)

	duration := "-"
	if j.Status.StartTime != nil {
		if j.Status.CompletionTime != nil {
			d := j.Status.CompletionTime.Sub(j.Status.StartTime.Time).Round(time.Second)
			duration = d.String()
		} else {
			d := time.Since(j.Status.StartTime.Time).Round(time.Second)
			duration = fmt.Sprintf("%s (running)", d.String())
		}
	}

	image := ""
	if len(j.Spec.Template.Spec.Containers) > 0 {
		image = j.Spec.Template.Spec.Containers[0].Image
	}

	return JobSummary{
		Name:        j.Name,
		Namespace:   j.Namespace,
		Status:      status,
		Completions: completions,
		Duration:    duration,
		Age:         FormatAge(j.CreationTimestamp.Time),
		Image:       image,
	}
}

// TriggerCronJob creates and triggers an immediate execution of a new Job from a CronJob.
func (b *KubeBridge) TriggerCronJob(namespace, cronJobName string) (*JobSummary, error) {
	slog.Info("TriggerCronJob called", "cronjob", cronJobName, "namespace", namespace)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("TriggerCronJob failed: no active Kubernetes client manager", "cronjob", cronJobName, "namespace", namespace)
		return nil, NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("TriggerCronJob failed: unable to acquire clientset", "cronjob", cronJobName, "namespace", namespace, "error", err)
		return nil, NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	createdJob, err := kube.TriggerCronJob(timeoutCtx, clientset, namespace, cronJobName)
	if err != nil {
		slog.Error("TriggerCronJob failed", "cronjob", cronJobName, "namespace", namespace, "error", err)
		if apierrors.IsForbidden(err) {
			return nil, NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden triggering cronjob %q in namespace %q", cronJobName, namespace), err.Error(), false)
		}
		return nil, NewAppError(ErrCodeInternalError, fmt.Sprintf("failed to trigger cronjob %s/%s", namespace, cronJobName), err.Error(), false)
	}

	summary := formatJobSummary(createdJob)
	slog.Info("TriggerCronJob returned", "cronjob", cronJobName, "namespace", namespace, "triggeredJob", summary.Name)
	return &summary, nil
}

// RerunJob clones and triggers re-execution of an existing Job.
func (b *KubeBridge) RerunJob(namespace, jobName string) (*JobSummary, error) {
	slog.Info("RerunJob called", "job", jobName, "namespace", namespace)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("RerunJob failed: no active Kubernetes client manager", "job", jobName, "namespace", namespace)
		return nil, NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("RerunJob failed: unable to acquire clientset", "job", jobName, "namespace", namespace, "error", err)
		return nil, NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	createdJob, err := kube.RerunJob(timeoutCtx, clientset, namespace, jobName)
	if err != nil {
		slog.Error("RerunJob failed", "job", jobName, "namespace", namespace, "error", err)
		if apierrors.IsForbidden(err) {
			return nil, NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden rerunning job %q in namespace %q", jobName, namespace), err.Error(), false)
		}
		return nil, NewAppError(ErrCodeInternalError, fmt.Sprintf("failed to rerun job %s/%s", namespace, jobName), err.Error(), false)
	}

	summary := formatJobSummary(createdJob)
	slog.Info("RerunJob returned", "job", jobName, "namespace", namespace, "newJob", summary.Name)
	return &summary, nil
}

