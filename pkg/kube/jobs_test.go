package kube

import (
	"context"
	"strings"
	"testing"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestGenerateJobName(t *testing.T) {
	tests := []struct {
		name      string
		baseName  string
		action    string
		timestamp int64
		wantMax   int
	}{
		{
			name:      "Short name",
			baseName:  "my-cron",
			action:    "manual",
			timestamp: 1712345678,
			wantMax:   63,
		},
		{
			name:      "Very long name exceeding 63 characters",
			baseName:  "extremely-long-cronjob-name-that-is-way-too-long-and-exceeds-sixty-three-chars",
			action:    "manual",
			timestamp: 1712345678,
			wantMax:   63,
		},
		{
			name:      "Rerun of a previously rerun job strips old suffix",
			baseName:  "my-job-rerun-1711111111",
			action:    "rerun",
			timestamp: 1712222222,
			wantMax:   63,
		},
		{
			name:      "Rerun of a manual cronjob run strips old suffix",
			baseName:  "nightly-backup-manual-1711111111",
			action:    "rerun",
			timestamp: 1712222222,
			wantMax:   63,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GenerateJobName(tt.baseName, tt.action, tt.timestamp)
			if len(got) > tt.wantMax {
				t.Errorf("GenerateJobName() len = %d, want <= %d (result: %q)", len(got), tt.wantMax, got)
			}
			if strings.HasSuffix(got, "-") || strings.HasPrefix(got, "-") {
				t.Errorf("GenerateJobName() produced invalid leading/trailing dash: %q", got)
			}
			if !strings.Contains(got, tt.action) {
				t.Errorf("GenerateJobName() missing action %q in %q", tt.action, got)
			}
		})
	}
}

func TestTriggerCronJob(t *testing.T) {
	ctx := context.Background()

	cronJob := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "nightly-sync",
			Namespace: "default",
		},
		Spec: batchv1.CronJobSpec{
			Schedule: "0 0 * * *",
			JobTemplate: batchv1.JobTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app":  "sync",
						"tier": "backend",
					},
					Annotations: map[string]string{
						"custom.io/alert": "true",
					},
				},
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							Containers: []corev1.Container{
								{
									Name:  "sync-container",
									Image: "sync:v1.2",
								},
							},
							RestartPolicy: corev1.RestartPolicyOnFailure,
						},
					},
				},
			},
		},
	}

	clientset := fake.NewSimpleClientset(cronJob)

	job, err := TriggerCronJob(ctx, clientset, "default", "nightly-sync")
	if err != nil {
		t.Fatalf("expected TriggerCronJob to succeed, got: %v", err)
	}

	if job == nil {
		t.Fatal("expected non-nil created Job")
	}

	if !strings.HasPrefix(job.Name, "nightly-sync-manual-") {
		t.Errorf("expected job name to start with nightly-sync-manual-, got %q", job.Name)
	}

	if job.Annotations["cronjob.kubernetes.io/instantiate"] != "manual" {
		t.Errorf("expected manual instantiate annotation, got %v", job.Annotations)
	}

	if job.Labels["app"] != "sync" || job.Labels["tier"] != "backend" {
		t.Errorf("expected labels to be preserved from JobTemplate, got %v", job.Labels)
	}

	// Verify job exists in clientset
	fetched, err := clientset.BatchV1().Jobs("default").Get(ctx, job.Name, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("expected job %q to exist in fake clientset: %v", job.Name, err)
	}
	if fetched.Spec.Template.Spec.Containers[0].Image != "sync:v1.2" {
		t.Errorf("expected container image sync:v1.2, got %q", fetched.Spec.Template.Spec.Containers[0].Image)
	}
}

func TestTriggerCronJob_Validation(t *testing.T) {
	ctx := context.Background()
	clientset := fake.NewSimpleClientset()

	if _, err := TriggerCronJob(ctx, nil, "default", "sync"); err == nil {
		t.Error("expected error with nil clientset")
	}
	if _, err := TriggerCronJob(ctx, clientset, "", "sync"); err == nil {
		t.Error("expected error with empty namespace")
	}
	if _, err := TriggerCronJob(ctx, clientset, "default", ""); err == nil {
		t.Error("expected error with empty cronJobName")
	}
	if _, err := TriggerCronJob(ctx, clientset, "default", "non-existent"); err == nil {
		t.Error("expected error when cronjob does not exist")
	}
}

func TestRerunJob(t *testing.T) {
	ctx := context.Background()

	origJob := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "db-migrate-1",
			Namespace: "production",
			Labels: map[string]string{
				"app":                              "db-migrate",
				"controller-uid":                   "abc-123",
				"batch.kubernetes.io/controller-uid": "abc-123",
				"job-name":                         "db-migrate-1",
			},
			Annotations: map[string]string{
				"managed-by": "admin",
			},
		},
		Spec: batchv1.JobSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"controller-uid": "abc-123",
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app":                              "db-migrate",
						"controller-uid":                   "abc-123",
						"batch.kubernetes.io/controller-uid": "abc-123",
						"job-name":                         "db-migrate-1",
						"batch.kubernetes.io/job-name":     "db-migrate-1",
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "migrate",
							Image: "migrate:v2.0",
						},
					},
					RestartPolicy: corev1.RestartPolicyNever,
				},
			},
		},
	}

	clientset := fake.NewSimpleClientset(origJob)

	newJob, err := RerunJob(ctx, clientset, "production", "db-migrate-1")
	if err != nil {
		t.Fatalf("expected RerunJob to succeed, got: %v", err)
	}

	if newJob == nil {
		t.Fatal("expected non-nil created Job")
	}

	if !strings.HasPrefix(newJob.Name, "db-migrate-1-rerun-") {
		t.Errorf("expected job name to start with db-migrate-1-rerun-, got %q", newJob.Name)
	}

	// Verify immutable selectors stripped
	if newJob.Spec.Selector != nil {
		t.Errorf("expected Spec.Selector to be nil, got: %v", newJob.Spec.Selector)
	}

	// Verify template controller-uid and job-name stripped
	for _, forbidden := range []string{"controller-uid", "batch.kubernetes.io/controller-uid", "job-name", "batch.kubernetes.io/job-name"} {
		if _, exists := newJob.Spec.Template.Labels[forbidden]; exists {
			t.Errorf("expected template label %q to be deleted, but it still exists", forbidden)
		}
		if _, exists := newJob.Labels[forbidden]; exists {
			t.Errorf("expected job label %q to be omitted, but it still exists", forbidden)
		}
	}

	// Verify user labels & annotations copied
	if newJob.Labels["app"] != "db-migrate" {
		t.Errorf("expected user label app=db-migrate, got %v", newJob.Labels)
	}
	if newJob.Annotations["managed-by"] != "admin" {
		t.Errorf("expected annotation managed-by=admin, got %v", newJob.Annotations)
	}

	// Verify container spec is identical
	if newJob.Spec.Template.Spec.Containers[0].Image != "migrate:v2.0" {
		t.Errorf("expected image migrate:v2.0, got %q", newJob.Spec.Template.Spec.Containers[0].Image)
	}
}

func TestRerunJob_Validation(t *testing.T) {
	ctx := context.Background()
	clientset := fake.NewSimpleClientset()

	if _, err := RerunJob(ctx, nil, "default", "job-1"); err == nil {
		t.Error("expected error with nil clientset")
	}
	if _, err := RerunJob(ctx, clientset, "", "job-1"); err == nil {
		t.Error("expected error with empty namespace")
	}
	if _, err := RerunJob(ctx, clientset, "default", ""); err == nil {
		t.Error("expected error with empty jobName")
	}
	if _, err := RerunJob(ctx, clientset, "default", "non-existent"); err == nil {
		t.Error("expected error when job does not exist")
	}
}
