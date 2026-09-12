package kube

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDeletePod(t *testing.T) {
	ctx := context.Background()
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-pod",
			Namespace: "default",
		},
	}
	clientset := fake.NewSimpleClientset(pod)

	zeroGrace := int64(0)
	err := DeletePod(ctx, clientset, "default", "test-pod", &zeroGrace)
	if err != nil {
		t.Fatalf("expected DeletePod to succeed, got: %v", err)
	}

	// Verify pod is deleted
	_, err = clientset.CoreV1().Pods("default").Get(ctx, "test-pod", metav1.GetOptions{})
	if err == nil {
		t.Fatalf("expected pod to be deleted, but it still exists")
	}
}

func TestDeletePod_Validation(t *testing.T) {
	ctx := context.Background()
	clientset := fake.NewSimpleClientset()

	if err := DeletePod(ctx, nil, "default", "test-pod", nil); err == nil {
		t.Error("expected error with nil clientset")
	}
	if err := DeletePod(ctx, clientset, "", "test-pod", nil); err == nil {
		t.Error("expected error with empty namespace")
	}
	if err := DeletePod(ctx, clientset, "default", "", nil); err == nil {
		t.Error("expected error with empty podName")
	}
}

func TestRestartPod(t *testing.T) {
	ctx := context.Background()
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "nginx-pod",
			Namespace: "prod",
		},
	}
	clientset := fake.NewSimpleClientset(pod)

	err := RestartPod(ctx, clientset, "prod", "nginx-pod")
	if err != nil {
		t.Fatalf("expected RestartPod to succeed, got: %v", err)
	}

	_, err = clientset.CoreV1().Pods("prod").Get(ctx, "nginx-pod", metav1.GetOptions{})
	if err == nil {
		t.Fatalf("expected pod to be deleted for restart, but it still exists")
	}
}

func TestGetJobLatestPod(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	pod1 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "batch-job-xyz-1",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(now.Add(-10 * time.Minute)),
			Labels: map[string]string{
				"job-name": "batch-job",
			},
		},
	}
	pod2 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "batch-job-xyz-2",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(now.Add(-1 * time.Minute)),
			Labels: map[string]string{
				"job-name": "batch-job",
			},
		},
	}

	clientset := fake.NewSimpleClientset(pod1, pod2)

	latest, err := GetJobLatestPod(ctx, clientset, "default", "batch-job")
	if err != nil {
		t.Fatalf("expected GetJobLatestPod to succeed, got: %v", err)
	}
	if latest.Name != "batch-job-xyz-2" {
		t.Errorf("expected latest pod to be batch-job-xyz-2, got: %s", latest.Name)
	}
}

func TestGetJobLatestPod_NotFound(t *testing.T) {
	ctx := context.Background()
	clientset := fake.NewSimpleClientset()

	_, err := GetJobLatestPod(ctx, clientset, "default", "nonexistent-job")
	if err == nil {
		t.Fatal("expected error when no pods match job, got nil")
	}
}
