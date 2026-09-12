package ipc

import (
	"testing"

	"github.com/teeaa/kermitt/pkg/kube"
)

func TestKubeBridge_ClusterConfig_NilClientManager(t *testing.T) {
	bridge := NewKubeBridge(nil)

	// 1. GetNodes
	nodes, err := bridge.GetNodes()
	if err != nil {
		t.Fatalf("expected nil error for nil client manager, got %v", err)
	}
	if len(nodes) != 0 {
		t.Errorf("expected 0 nodes, got %d", len(nodes))
	}

	// 2. GetServices
	svcs, err := bridge.GetServices("default")
	if err != nil {
		t.Fatalf("expected nil error for nil client manager, got %v", err)
	}
	if len(svcs) != 0 {
		t.Errorf("expected 0 services, got %d", len(svcs))
	}

	// 3. GetIngresses
	ings, err := bridge.GetIngresses("default")
	if err != nil {
		t.Fatalf("expected nil error for nil client manager, got %v", err)
	}
	if len(ings) != 0 {
		t.Errorf("expected 0 ingresses, got %d", len(ings))
	}

	// 4. GetConfigMaps
	cms, err := bridge.GetConfigMaps("default")
	if err != nil {
		t.Fatalf("expected nil error for nil client manager, got %v", err)
	}
	if len(cms) != 0 {
		t.Errorf("expected 0 configmaps, got %d", len(cms))
	}

	// 5. GetSecrets
	secs, err := bridge.GetSecrets("default")
	if err != nil {
		t.Fatalf("expected nil error for nil client manager, got %v", err)
	}
	if len(secs) != 0 {
		t.Errorf("expected 0 secrets, got %d", len(secs))
	}

	// 6. Counts
	counts, err := bridge.GetClusterConfigCounts("default")
	if err != nil {
		t.Fatalf("expected nil error for nil client manager, got %v", err)
	}
	if counts.NodeCount != 0 || counts.ServiceCount != 0 || counts.IngressCount != 0 || counts.ConfigMapCount != 0 || counts.SecretCount != 0 {
		t.Errorf("expected all 0 counts, got %+v", counts)
	}

	// 7. GetConfigMapData
	_, err = bridge.GetConfigMapData("default", "test-cm")
	if err == nil {
		t.Fatal("expected error for nil client manager")
	}

	// 8. GetSecretData
	_, err = bridge.GetSecretData("default", "test-sec")
	if err == nil {
		t.Fatal("expected error for nil client manager")
	}

	// 9. DeleteConfigMap
	err = bridge.DeleteConfigMap("default", "test-cm")
	if err == nil {
		t.Fatal("expected error for nil client manager")
	}

	// 10. DeleteSecret
	err = bridge.DeleteSecret("default", "test-sec")
	if err == nil {
		t.Fatal("expected error for nil client manager")
	}

	// 11. GetResourceYAML
	_, err = bridge.GetResourceYAML("node", "", "node-1")
	if err == nil {
		t.Fatal("expected error for nil client manager")
	}
}

func TestKubeBridge_ClusterConfig_WithClientManager(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error creating client manager: %v", err)
	}

	bridge := NewKubeBridge(cm)

	// Test fallback and methods against live or offline cluster
	_, _ = bridge.GetNodes()
	_, _ = bridge.GetServices("all")
	_, _ = bridge.GetIngresses("default")
	_, _ = bridge.GetConfigMaps("kube-system")
	_, _ = bridge.GetSecrets("default")
	_, _ = bridge.GetClusterConfigCounts("all")

	// Unsupported kind test
	_, err = bridge.GetResourceYAML("unsupported-kind", "default", "item")
	if err == nil {
		t.Fatal("expected error for unsupported kind")
	}
}
