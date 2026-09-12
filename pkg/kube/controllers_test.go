package kube

import (
	"context"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestGetControllerPods_Deployment(t *testing.T) {
	ctx := context.Background()

	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-deploy",
			Namespace: "default",
		},
		Spec: appsv1.DeploymentSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "web"},
			},
		},
	}

	pod1 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-deploy-pod-1",
			Namespace: "default",
			Labels:    map[string]string{"app": "web"},
		},
	}
	pod2 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-deploy-pod-2",
			Namespace: "default",
			Labels:    map[string]string{"app": "web"},
		},
	}
	otherPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "db-pod-1",
			Namespace: "default",
			Labels:    map[string]string{"app": "db"},
		},
	}

	clientset := fake.NewSimpleClientset(dep, pod1, pod2, otherPod)

	pods, err := GetControllerPods(ctx, clientset, "default", "Deployment", "web-deploy")
	if err != nil {
		t.Fatalf("expected GetControllerPods to succeed, got %v", err)
	}
	if len(pods) != 2 {
		t.Fatalf("expected 2 pods, got %d", len(pods))
	}
}

func TestGetControllerPods_StatefulSet(t *testing.T) {
	ctx := context.Background()

	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "redis-sts",
			Namespace: "cache",
		},
		Spec: appsv1.StatefulSetSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "redis"},
			},
		},
	}

	pod1 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "redis-sts-0",
			Namespace: "cache",
			Labels:    map[string]string{"app": "redis"},
		},
	}

	clientset := fake.NewSimpleClientset(sts, pod1)

	pods, err := GetControllerPods(ctx, clientset, "cache", "StatefulSet", "redis-sts")
	if err != nil {
		t.Fatalf("expected GetControllerPods to succeed, got %v", err)
	}
	if len(pods) != 1 || pods[0].Name != "redis-sts-0" {
		t.Fatalf("expected redis-sts-0, got %v", pods)
	}
}

func TestGetControllerPods_DaemonSet(t *testing.T) {
	ctx := context.Background()

	ds := &appsv1.DaemonSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "fluentd-ds",
			Namespace: "kube-system",
		},
		Spec: appsv1.DaemonSetSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"app": "fluentd"},
			},
		},
	}

	pod1 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "fluentd-ds-node1",
			Namespace: "kube-system",
			Labels:    map[string]string{"app": "fluentd"},
		},
	}

	clientset := fake.NewSimpleClientset(ds, pod1)

	pods, err := GetControllerPods(ctx, clientset, "kube-system", "DaemonSet", "fluentd-ds")
	if err != nil {
		t.Fatalf("expected GetControllerPods to succeed, got %v", err)
	}
	if len(pods) != 1 || pods[0].Name != "fluentd-ds-node1" {
		t.Fatalf("expected fluentd-ds-node1, got %v", pods)
	}
}

func TestGetControllerPods_Job(t *testing.T) {
	ctx := context.Background()

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "db-migrate",
			Namespace: "prod",
		},
		Spec: batchv1.JobSpec{
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{"job-name": "db-migrate"},
			},
		},
	}

	pod1 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "db-migrate-abcde",
			Namespace: "prod",
			Labels:    map[string]string{"job-name": "db-migrate"},
		},
	}

	clientset := fake.NewSimpleClientset(job, pod1)

	pods, err := GetControllerPods(ctx, clientset, "prod", "Job", "db-migrate")
	if err != nil {
		t.Fatalf("expected GetControllerPods to succeed, got %v", err)
	}
	if len(pods) != 1 || pods[0].Name != "db-migrate-abcde" {
		t.Fatalf("expected db-migrate-abcde, got %v", pods)
	}
}

func TestGetControllerPods_Validation(t *testing.T) {
	ctx := context.Background()
	clientset := fake.NewSimpleClientset()

	if _, err := GetControllerPods(ctx, nil, "default", "Deployment", "test"); err == nil {
		t.Error("expected error with nil clientset")
	}
	if _, err := GetControllerPods(ctx, clientset, "", "Deployment", "test"); err == nil {
		t.Error("expected error with empty namespace")
	}
	if _, err := GetControllerPods(ctx, clientset, "default", "UnsupportedKind", "test"); err == nil {
		t.Error("expected error with unsupported kind")
	}
}
