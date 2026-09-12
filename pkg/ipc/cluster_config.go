package ipc

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/yaml"
)

// ============================================================================
// Nodes API
// ============================================================================

// GetNodes returns all cluster nodes.
// GetNodes queries CoreV1().Nodes().List().
func (b *KubeBridge) GetNodes() ([]NodeSummary, error) {
	slog.Info("GetNodes called")

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetNodes(); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, n := range cached {
				names = append(names, n.Name)
			}
			slog.Info("GetNodes returned", "count", len(cached), "nodes", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetNodes: client manager is nil")
		slog.Info("GetNodes returned", "count", 0, "nodes", []string{})
		return make([]NodeSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetNodes failed: unable to acquire clientset", "error", err)
		return make([]NodeSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.CoreV1().Nodes().List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetNodes failed: error listing nodes", "error", err)
		if apierrors.IsForbidden(err) {
			return make([]NodeSummary, 0), NewAppError(ErrCodeForbidden, "Access forbidden listing nodes", err.Error(), false)
		}
		return make([]NodeSummary, 0), NewAppError(ErrCodeInternalError, "Failed to list nodes", err.Error(), true)
	}

	res := make([]NodeSummary, 0, len(list.Items))
	for _, n := range list.Items {
		status := "NotReady"
		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
				status = "Ready"
				break
			}
		}

		var roles []string
		for k := range n.Labels {
			if strings.HasPrefix(k, "node-role.kubernetes.io/") {
				role := strings.TrimPrefix(k, "node-role.kubernetes.io/")
				if role != "" {
					roles = append(roles, role)
				}
			}
		}
		if len(roles) == 0 {
			if r, ok := n.Labels["kubernetes.io/role"]; ok && r != "" {
				roles = append(roles, r)
			} else {
				roles = append(roles, "worker")
			}
		}
		sort.Strings(roles)

		internalIP := "<none>"
		for _, addr := range n.Status.Addresses {
			if addr.Type == corev1.NodeInternalIP {
				internalIP = addr.Address
				break
			}
		}
		if internalIP == "<none>" && len(n.Status.Addresses) > 0 {
			internalIP = n.Status.Addresses[0].Address
		}

		res = append(res, NodeSummary{
			Name:       n.Name,
			Status:     status,
			Roles:      strings.Join(roles, ", "),
			Version:    n.Status.NodeInfo.KubeletVersion,
			InternalIP: internalIP,
			OSImage:    n.Status.NodeInfo.OSImage,
			Age:        FormatAge(n.CreationTimestamp.Time),
		})
	}
	if b.workloadCache != nil {
		b.workloadCache.SetNodes(res)
	}

	names := make([]string, 0, len(res))
	for _, n := range res {
		names = append(names, n.Name)
	}
	slog.Info("GetNodes returned", "count", len(res), "nodes", names)
	return res, nil
}

// ============================================================================
// Services & Ingresses API
// ============================================================================

// GetServices returns all services in the specified namespace (or all namespaces if "all" or "").
// GetServices queries CoreV1().Services().List().
func (b *KubeBridge) GetServices(namespace string) ([]ServiceSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetServices called", "namespace", ns)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetServices(ns); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, s := range cached {
				names = append(names, s.Name)
			}
			slog.Info("GetServices returned", "namespace", ns, "count", len(cached), "services", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetServices: client manager is nil")
		slog.Info("GetServices returned", "namespace", ns, "count", 0, "services", []string{})
		return make([]ServiceSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetServices failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]ServiceSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.CoreV1().Services(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetServices failed: error listing services", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]ServiceSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing services in namespace %q", namespace), err.Error(), false)
		}
		return make([]ServiceSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list services in namespace %q", namespace), err.Error(), true)
	}

	res := make([]ServiceSummary, 0, len(list.Items))
	for _, s := range list.Items {
		var externalIPs []string
		for _, ing := range s.Status.LoadBalancer.Ingress {
			if ing.IP != "" {
				externalIPs = append(externalIPs, ing.IP)
			} else if ing.Hostname != "" {
				externalIPs = append(externalIPs, ing.Hostname)
			}
		}
		if len(externalIPs) == 0 && len(s.Spec.ExternalIPs) > 0 {
			externalIPs = append(externalIPs, s.Spec.ExternalIPs...)
		}
		extIPStr := "<none>"
		if len(externalIPs) > 0 {
			extIPStr = strings.Join(externalIPs, ", ")
		} else if s.Spec.Type == corev1.ServiceTypeLoadBalancer {
			extIPStr = "<pending>"
		}

		var portStrs []string
		for _, p := range s.Spec.Ports {
			proto := string(p.Protocol)
			if proto == "" {
				proto = "TCP"
			}
			if p.NodePort != 0 {
				portStrs = append(portStrs, fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, proto))
			} else {
				portStrs = append(portStrs, fmt.Sprintf("%d/%s", p.Port, proto))
			}
		}
		portsStr := "<none>"
		if len(portStrs) > 0 {
			portsStr = strings.Join(portStrs, ", ")
		}

		clusterIP := s.Spec.ClusterIP
		if clusterIP == "" {
			clusterIP = "<none>"
		}

		res = append(res, ServiceSummary{
			Name:       s.Name,
			Namespace:  s.Namespace,
			Type:       string(s.Spec.Type),
			ClusterIP:  clusterIP,
			ExternalIP: extIPStr,
			Ports:      portsStr,
			Age:        FormatAge(s.CreationTimestamp.Time),
			Selector:   s.Spec.Selector,
		})
	}
	if b.workloadCache != nil {
		b.workloadCache.SetServices(ns, res)
	}

	names := make([]string, 0, len(res))
	for _, s := range res {
		names = append(names, s.Name)
	}
	slog.Info("GetServices returned", "namespace", ns, "count", len(res), "services", names)
	return res, nil
}

// GetIngresses returns all ingresses in the specified namespace (or all namespaces if "all" or "").
// GetIngresses queries NetworkingV1().Ingresses().List().
func (b *KubeBridge) GetIngresses(namespace string) ([]IngressSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetIngresses called", "namespace", ns)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetIngresses(ns); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, ing := range cached {
				names = append(names, ing.Name)
			}
			slog.Info("GetIngresses returned", "namespace", ns, "count", len(cached), "ingresses", names, "cached", true)
			return cached, nil
		}
	}

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetIngresses: client manager is nil")
		slog.Info("GetIngresses returned", "namespace", ns, "count", 0, "ingresses", []string{})
		return make([]IngressSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetIngresses failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]IngressSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.NetworkingV1().Ingresses(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetIngresses failed: error listing ingresses", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]IngressSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing ingresses in namespace %q", namespace), err.Error(), false)
		}
		return make([]IngressSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list ingresses in namespace %q", namespace), err.Error(), true)
	}

	res := make([]IngressSummary, 0, len(list.Items))
	for _, ing := range list.Items {
		var hosts []string
		for _, r := range ing.Spec.Rules {
			if r.Host != "" {
				hosts = append(hosts, r.Host)
			}
		}
		hostsStr := "*"
		if len(hosts) > 0 {
			hostsStr = strings.Join(hosts, ", ")
		}

		var endpoints []string
		for _, lb := range ing.Status.LoadBalancer.Ingress {
			if lb.IP != "" {
				endpoints = append(endpoints, lb.IP)
			} else if lb.Hostname != "" {
				endpoints = append(endpoints, lb.Hostname)
			}
		}
		endpointStr := "<none>"
		if len(endpoints) > 0 {
			endpointStr = strings.Join(endpoints, ", ")
		}

		className := "<default>"
		if ing.Spec.IngressClassName != nil && *ing.Spec.IngressClassName != "" {
			className = *ing.Spec.IngressClassName
		}

		res = append(res, IngressSummary{
			Name:      ing.Name,
			Namespace: ing.Namespace,
			Hosts:     hostsStr,
			Endpoints: endpointStr,
			ClassName: className,
			Age:       FormatAge(ing.CreationTimestamp.Time),
		})
	}
	if b.workloadCache != nil {
		b.workloadCache.SetIngresses(ns, res)
	}

	names := make([]string, 0, len(res))
	for _, ing := range res {
		names = append(names, ing.Name)
	}
	slog.Info("GetIngresses returned", "namespace", ns, "count", len(res), "ingresses", names)
	return res, nil
}

// ============================================================================
// ConfigMaps & Secrets API
// ============================================================================

// GetConfigMaps returns all configmaps in the specified namespace.
// GetConfigMaps queries CoreV1().ConfigMaps().List().
func (b *KubeBridge) GetConfigMaps(namespace string) ([]ConfigMapSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetConfigMaps called", "namespace", ns)

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetConfigMaps: client manager is nil")
		slog.Info("GetConfigMaps returned", "namespace", ns, "count", 0, "configmaps", []string{})
		return make([]ConfigMapSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetConfigMaps failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]ConfigMapSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.CoreV1().ConfigMaps(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetConfigMaps failed: error listing configmaps", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]ConfigMapSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing configmaps in namespace %q", namespace), err.Error(), false)
		}
		return make([]ConfigMapSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list configmaps in namespace %q", namespace), err.Error(), true)
	}

	res := make([]ConfigMapSummary, 0, len(list.Items))
	for _, cm := range list.Items {
		res = append(res, ConfigMapSummary{
			Name:      cm.Name,
			Namespace: cm.Namespace,
			KeysCount: len(cm.Data) + len(cm.BinaryData),
			Age:       FormatAge(cm.CreationTimestamp.Time),
		})
	}

	names := make([]string, 0, len(res))
	for _, cm := range res {
		names = append(names, cm.Name)
	}
	slog.Info("GetConfigMaps returned", "namespace", ns, "count", len(res), "configmaps", names)
	return res, nil
}

// GetSecrets returns all secrets in the specified namespace.
// GetSecrets queries CoreV1().Secrets().List().
func (b *KubeBridge) GetSecrets(namespace string) ([]SecretSummary, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetSecrets called", "namespace", ns)

	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetSecrets: client manager is nil")
		slog.Info("GetSecrets returned", "namespace", ns, "count", 0, "secrets", []string{})
		return make([]SecretSummary, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetSecrets failed: unable to acquire clientset", "namespace", ns, "error", err)
		return make([]SecretSummary, 0), nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	list, err := clientset.CoreV1().Secrets(ns).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetSecrets failed: error listing secrets", "namespace", ns, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]SecretSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing secrets in namespace %q", namespace), err.Error(), false)
		}
		return make([]SecretSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list secrets in namespace %q", namespace), err.Error(), true)
	}

	res := make([]SecretSummary, 0, len(list.Items))
	for _, s := range list.Items {
		res = append(res, SecretSummary{
			Name:      s.Name,
			Namespace: s.Namespace,
			Type:      string(s.Type),
			KeysCount: len(s.Data),
			Age:       FormatAge(s.CreationTimestamp.Time),
		})
	}

	names := make([]string, 0, len(res))
	for _, s := range res {
		names = append(names, s.Name)
	}
	slog.Info("GetSecrets returned", "namespace", ns, "count", len(res), "secrets", names)
	return res, nil
}

// GetClusterConfigCounts returns counts for dynamic sidebar badges.
// GetClusterConfigCounts queries nodes, services, ingresses, configmaps, and secrets counts.
func (b *KubeBridge) GetClusterConfigCounts(namespace string) (ClusterConfigCounts, error) {
	ns := namespace
	if ns == "all" || ns == "*" {
		ns = metav1.NamespaceAll
	}

	slog.Info("GetClusterConfigCounts called", "namespace", ns)

	if b.workloadCache != nil {
		if cMap, ok := b.workloadCache.GetCounts(); ok {
			nodeC := cMap["nodeCount"]
			svcC := cMap["serviceCount"]
			ingC := cMap["ingressCount"]
			cmC := cMap["configMapCount"]
			secC := cMap["secretCount"]
			if nodeC > 0 || svcC > 0 || ingC > 0 || cmC > 0 || secC > 0 {
				counts := ClusterConfigCounts{
					NodeCount:      nodeC,
					ServiceCount:   svcC,
					IngressCount:   ingC,
					ConfigMapCount: cmC,
					SecretCount:    secC,
				}
				slog.Info("GetClusterConfigCounts returned", "namespace", ns, "counts", counts, "cached", true)
				return counts, nil
			}
		}
	}

	ctx := b.getContext()
	var counts ClusterConfigCounts
	if b.clientManager == nil {
		slog.Warn("GetClusterConfigCounts: client manager is nil")
		slog.Info("GetClusterConfigCounts returned", "namespace", ns, "counts", counts)
		return counts, nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetClusterConfigCounts failed: unable to acquire clientset", "namespace", ns, "error", err)
		return counts, nil
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	var mu sync.Mutex

	// 1. Nodes
	wg.Add(1)
	go func() {
		defer wg.Done()
		if list, err := clientset.CoreV1().Nodes().List(timeoutCtx, metav1.ListOptions{}); err == nil {
			mu.Lock()
			counts.NodeCount = len(list.Items)
			mu.Unlock()
		}
	}()

	// 2. Services
	wg.Add(1)
	go func() {
		defer wg.Done()
		if list, err := clientset.CoreV1().Services(ns).List(timeoutCtx, metav1.ListOptions{}); err == nil {
			mu.Lock()
			counts.ServiceCount = len(list.Items)
			mu.Unlock()
		}
	}()

	// 3. Ingresses
	wg.Add(1)
	go func() {
		defer wg.Done()
		if list, err := clientset.NetworkingV1().Ingresses(ns).List(timeoutCtx, metav1.ListOptions{}); err == nil {
			mu.Lock()
			counts.IngressCount = len(list.Items)
			mu.Unlock()
		}
	}()

	// 4. ConfigMaps
	wg.Add(1)
	go func() {
		defer wg.Done()
		if list, err := clientset.CoreV1().ConfigMaps(ns).List(timeoutCtx, metav1.ListOptions{}); err == nil {
			mu.Lock()
			counts.ConfigMapCount = len(list.Items)
			mu.Unlock()
		}
	}()

	// 5. Secrets
	wg.Add(1)
	go func() {
		defer wg.Done()
		if list, err := clientset.CoreV1().Secrets(ns).List(timeoutCtx, metav1.ListOptions{}); err == nil {
			mu.Lock()
			counts.SecretCount = len(list.Items)
			mu.Unlock()
		}
	}()

	wg.Wait()
	slog.Info("GetClusterConfigCounts returned", "namespace", ns, "counts", counts)
	return counts, nil
}

// ============================================================================
// Data Inspection & Deletion API
// ============================================================================

// GetConfigMapData returns all key-value entries for a configmap.
// GetConfigMapData queries CoreV1().ConfigMaps().Get().
func (b *KubeBridge) GetConfigMapData(namespace, name string) (map[string]string, error) {
	slog.Info("GetConfigMapData called", "namespace", namespace, "name", name)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("GetConfigMapData failed: client manager not initialized", "namespace", namespace, "name", name)
		return nil, NewAppError(ErrCodeInternalError, "Client manager not initialized", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetConfigMapData failed: unable to acquire clientset", "namespace", namespace, "name", name, "error", err)
		return nil, err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	cm, err := clientset.CoreV1().ConfigMaps(namespace).Get(timeoutCtx, name, metav1.GetOptions{})
	if err != nil {
		slog.Error("GetConfigMapData failed: get configmap failed", "namespace", namespace, "name", name, "error", err)
		return nil, err
	}

	res := make(map[string]string)
	for k, v := range cm.Data {
		res[k] = v
	}
	for k, v := range cm.BinaryData {
		res[k] = string(v)
	}
	slog.Info("GetConfigMapData returned", "namespace", namespace, "name", name, "keysCount", len(res))
	return res, nil
}

// GetSecretData returns all decoded key-value entries for a secret.
// GetSecretData queries CoreV1().Secrets().Get().
func (b *KubeBridge) GetSecretData(namespace, name string) (map[string]string, error) {
	slog.Info("GetSecretData called", "namespace", namespace, "name", name)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("GetSecretData failed: client manager not initialized", "namespace", namespace, "name", name)
		return nil, NewAppError(ErrCodeInternalError, "Client manager not initialized", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetSecretData failed: unable to acquire clientset", "namespace", namespace, "name", name, "error", err)
		return nil, err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	sec, err := clientset.CoreV1().Secrets(namespace).Get(timeoutCtx, name, metav1.GetOptions{})
	if err != nil {
		slog.Error("GetSecretData failed: get secret failed", "namespace", namespace, "name", name, "error", err)
		return nil, err
	}

	res := make(map[string]string)
	for k, v := range sec.Data {
		res[k] = string(v)
	}
	slog.Info("GetSecretData returned", "namespace", namespace, "name", name, "keysCount", len(res))
	return res, nil
}

// DeleteConfigMap deletes a configmap by name.
// DeleteConfigMap executes CoreV1().ConfigMaps().Delete().
func (b *KubeBridge) DeleteConfigMap(namespace, name string) error {
	slog.Info("DeleteConfigMap called", "namespace", namespace, "name", name)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("DeleteConfigMap failed: client manager not initialized", "namespace", namespace, "name", name)
		return NewAppError(ErrCodeInternalError, "Client manager not initialized", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("DeleteConfigMap failed: unable to acquire clientset", "namespace", namespace, "name", name, "error", err)
		return err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	err = clientset.CoreV1().ConfigMaps(namespace).Delete(timeoutCtx, name, metav1.DeleteOptions{})
	if err != nil {
		slog.Error("DeleteConfigMap failed", "namespace", namespace, "name", name, "error", err)
		return err
	}
	slog.Info("DeleteConfigMap returned", "namespace", namespace, "name", name)
	return nil
}

// DeleteSecret deletes a secret by name.
// DeleteSecret executes CoreV1().Secrets().Delete().
func (b *KubeBridge) DeleteSecret(namespace, name string) error {
	slog.Info("DeleteSecret called", "namespace", namespace, "name", name)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("DeleteSecret failed: client manager not initialized", "namespace", namespace, "name", name)
		return NewAppError(ErrCodeInternalError, "Client manager not initialized", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("DeleteSecret failed: unable to acquire clientset", "namespace", namespace, "name", name, "error", err)
		return err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	err = clientset.CoreV1().Secrets(namespace).Delete(timeoutCtx, name, metav1.DeleteOptions{})
	if err != nil {
		slog.Error("DeleteSecret failed", "namespace", namespace, "name", name, "error", err)
		return err
	}
	slog.Info("DeleteSecret returned", "namespace", namespace, "name", name)
	return nil
}

// GetResourceYAML fetches live resource YAML manifest.
// GetResourceYAML fetches the live Kubernetes resource and marshals it to YAML.
func (b *KubeBridge) GetResourceYAML(kind, namespace, name string) (string, error) {
	slog.Info("GetResourceYAML called", "kind", kind, "namespace", namespace, "name", name)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("GetResourceYAML failed: client manager not initialized", "kind", kind, "namespace", namespace, "name", name)
		return "", NewAppError(ErrCodeInternalError, "Client manager not initialized", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetResourceYAML failed: unable to acquire clientset", "kind", kind, "namespace", namespace, "name", name, "error", err)
		return "", err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var obj interface{}
	normalizedKind := strings.ToLower(strings.TrimSpace(kind))

	switch normalizedKind {
	case "node", "nodes":
		n, err := clientset.CoreV1().Nodes().Get(timeoutCtx, name, metav1.GetOptions{})
		if err != nil {
			slog.Error("GetResourceYAML failed: get node failed", "name", name, "error", err)
			return "", err
		}
		n.ManagedFields = nil
		obj = n
	case "service", "services", "svc":
		s, err := clientset.CoreV1().Services(namespace).Get(timeoutCtx, name, metav1.GetOptions{})
		if err != nil {
			slog.Error("GetResourceYAML failed: get service failed", "namespace", namespace, "name", name, "error", err)
			return "", err
		}
		s.ManagedFields = nil
		obj = s
	case "ingress", "ingresses", "ing":
		ing, err := clientset.NetworkingV1().Ingresses(namespace).Get(timeoutCtx, name, metav1.GetOptions{})
		if err != nil {
			slog.Error("GetResourceYAML failed: get ingress failed", "namespace", namespace, "name", name, "error", err)
			return "", err
		}
		ing.ManagedFields = nil
		obj = ing
	case "configmap", "configmaps", "cm":
		cm, err := clientset.CoreV1().ConfigMaps(namespace).Get(timeoutCtx, name, metav1.GetOptions{})
		if err != nil {
			slog.Error("GetResourceYAML failed: get configmap failed", "namespace", namespace, "name", name, "error", err)
			return "", err
		}
		cm.ManagedFields = nil
		obj = cm
	case "secret", "secrets":
		sec, err := clientset.CoreV1().Secrets(namespace).Get(timeoutCtx, name, metav1.GetOptions{})
		if err != nil {
			slog.Error("GetResourceYAML failed: get secret failed", "namespace", namespace, "name", name, "error", err)
			return "", err
		}
		sec.ManagedFields = nil
		obj = sec
	default:
		slog.Error("GetResourceYAML failed: unsupported kind", "kind", kind)
		return "", fmt.Errorf("unsupported resource kind for YAML inspection: %q", kind)
	}

	yamlBytes, err := yaml.Marshal(obj)
	if err != nil {
		slog.Error("GetResourceYAML failed: yaml marshal failed", "kind", kind, "error", err)
		return "", fmt.Errorf("failed to marshal resource to YAML: %w", err)
	}
	slog.Info("GetResourceYAML returned", "kind", kind, "namespace", namespace, "name", name)
	return string(yamlBytes), nil
}
