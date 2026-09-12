export namespace ipc {
	
	export class ClusterConfigCounts {
	    nodeCount: number;
	    serviceCount: number;
	    ingressCount: number;
	    configMapCount: number;
	    secretCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ClusterConfigCounts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nodeCount = source["nodeCount"];
	        this.serviceCount = source["serviceCount"];
	        this.ingressCount = source["ingressCount"];
	        this.configMapCount = source["configMapCount"];
	        this.secretCount = source["secretCount"];
	    }
	}
	export class ClusterHealthInfo {
	    endpoint: string;
	    serverVersion: string;
	    latencyMs: number;
	    authIdentity: string;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ClusterHealthInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.endpoint = source["endpoint"];
	        this.serverVersion = source["serverVersion"];
	        this.latencyMs = source["latencyMs"];
	        this.authIdentity = source["authIdentity"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}
	export class ClusterOverview {
	    contextName: string;
	    nodeCount: number;
	    namespaceCount: number;
	    podCount: number;
	    runningPods: number;
	    pendingPods: number;
	    failedPods: number;
	
	    static createFrom(source: any = {}) {
	        return new ClusterOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.contextName = source["contextName"];
	        this.nodeCount = source["nodeCount"];
	        this.namespaceCount = source["namespaceCount"];
	        this.podCount = source["podCount"];
	        this.runningPods = source["runningPods"];
	        this.pendingPods = source["pendingPods"];
	        this.failedPods = source["failedPods"];
	    }
	}
	export class ConfigMapSummary {
	    name: string;
	    namespace: string;
	    keysCount: number;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new ConfigMapSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.keysCount = source["keysCount"];
	        this.age = source["age"];
	    }
	}
	export class ContainerStateTerminated {
	    exitCode: number;
	    signal?: number;
	    reason?: string;
	    message?: string;
	    // Go type: time
	    startedAt?: any;
	    // Go type: time
	    finishedAt?: any;
	    containerId?: string;
	
	    static createFrom(source: any = {}) {
	        return new ContainerStateTerminated(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exitCode = source["exitCode"];
	        this.signal = source["signal"];
	        this.reason = source["reason"];
	        this.message = source["message"];
	        this.startedAt = this.convertValues(source["startedAt"], null);
	        this.finishedAt = this.convertValues(source["finishedAt"], null);
	        this.containerId = source["containerId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ContainerStateWaiting {
	    reason?: string;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new ContainerStateWaiting(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reason = source["reason"];
	        this.message = source["message"];
	    }
	}
	export class ContainerStateRunning {
	    // Go type: time
	    startedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ContainerStateRunning(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.startedAt = this.convertValues(source["startedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ContainerState {
	    status: string;
	    running?: ContainerStateRunning;
	    waiting?: ContainerStateWaiting;
	    terminated?: ContainerStateTerminated;
	
	    static createFrom(source: any = {}) {
	        return new ContainerState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.running = this.convertValues(source["running"], ContainerStateRunning);
	        this.waiting = this.convertValues(source["waiting"], ContainerStateWaiting);
	        this.terminated = this.convertValues(source["terminated"], ContainerStateTerminated);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ContainerDetail {
	    name: string;
	    image: string;
	    ready: boolean;
	    restartCount: number;
	    state: ContainerState;
	
	    static createFrom(source: any = {}) {
	        return new ContainerDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.image = source["image"];
	        this.ready = source["ready"];
	        this.restartCount = source["restartCount"];
	        this.state = this.convertValues(source["state"], ContainerState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class CronJobSummary {
	    name: string;
	    namespace: string;
	    schedule: string;
	    scheduleDescription: string;
	    suspend: boolean;
	    activeJobs: number;
	    lastSchedule: string;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new CronJobSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.schedule = source["schedule"];
	        this.scheduleDescription = source["scheduleDescription"];
	        this.suspend = source["suspend"];
	        this.activeJobs = source["activeJobs"];
	        this.lastSchedule = source["lastSchedule"];
	        this.age = source["age"];
	    }
	}
	export class DeploymentSummary {
	    name: string;
	    namespace: string;
	    status: string;
	    ready: string;
	    readyReplicas: number;
	    totalReplicas: number;
	    upToDate: number;
	    available: number;
	    age: string;
	    conditions: string;
	
	    static createFrom(source: any = {}) {
	        return new DeploymentSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.ready = source["ready"];
	        this.readyReplicas = source["readyReplicas"];
	        this.totalReplicas = source["totalReplicas"];
	        this.upToDate = source["upToDate"];
	        this.available = source["available"];
	        this.age = source["age"];
	        this.conditions = source["conditions"];
	    }
	}
	export class ExecRequest {
	    namespace: string;
	    podName: string;
	    containerName?: string;
	    command?: string;
	    cols: number;
	    rows: number;
	
	    static createFrom(source: any = {}) {
	        return new ExecRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.namespace = source["namespace"];
	        this.podName = source["podName"];
	        this.containerName = source["containerName"];
	        this.command = source["command"];
	        this.cols = source["cols"];
	        this.rows = source["rows"];
	    }
	}
	export class IngressSummary {
	    name: string;
	    namespace: string;
	    hosts: string;
	    endpoints: string;
	    className: string;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new IngressSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.hosts = source["hosts"];
	        this.endpoints = source["endpoints"];
	        this.className = source["className"];
	        this.age = source["age"];
	    }
	}
	export class PodSummary {
	    name: string;
	    namespace: string;
	    status: string;
	    totalContainers: number;
	    readyContainers: number;
	    restartCount: number;
	    age: string;
	    // Go type: time
	    createdAt: any;
	    ip: string;
	    nodeName: string;
	    containers: string[];
	    initContainers?: string[];
	    cpuUsage?: string;
	    cpuLimit?: string;
	    cpuRequest?: string;
	    memoryUsage?: string;
	    memoryLimit?: string;
	    memoryRequest?: string;
	
	    static createFrom(source: any = {}) {
	        return new PodSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.totalContainers = source["totalContainers"];
	        this.readyContainers = source["readyContainers"];
	        this.restartCount = source["restartCount"];
	        this.age = source["age"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.ip = source["ip"];
	        this.nodeName = source["nodeName"];
	        this.containers = source["containers"];
	        this.initContainers = source["initContainers"];
	        this.cpuUsage = source["cpuUsage"];
	        this.cpuLimit = source["cpuLimit"];
	        this.cpuRequest = source["cpuRequest"];
	        this.memoryUsage = source["memoryUsage"];
	        this.memoryLimit = source["memoryLimit"];
	        this.memoryRequest = source["memoryRequest"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InitialBootstrapState {
	    activeContext: string;
	    activeNamespace: string;
	    pods: PodSummary[];
	
	    static createFrom(source: any = {}) {
	        return new InitialBootstrapState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activeContext = source["activeContext"];
	        this.activeNamespace = source["activeNamespace"];
	        this.pods = this.convertValues(source["pods"], PodSummary);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class JobSummary {
	    name: string;
	    namespace: string;
	    status: string;
	    completions: string;
	    duration: string;
	    age: string;
	    image: string;
	
	    static createFrom(source: any = {}) {
	        return new JobSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.completions = source["completions"];
	        this.duration = source["duration"];
	        this.age = source["age"];
	        this.image = source["image"];
	    }
	}
	export class KubeBridge {
	
	
	    static createFrom(source: any = {}) {
	        return new KubeBridge(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class KubeContext {
	    name: string;
	    clusterName: string;
	    userName: string;
	    isActive: boolean;
	    namespace?: string;
	    environment?: string;
	
	    static createFrom(source: any = {}) {
	        return new KubeContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.clusterName = source["clusterName"];
	        this.userName = source["userName"];
	        this.isActive = source["isActive"];
	        this.namespace = source["namespace"];
	        this.environment = source["environment"];
	    }
	}
	export class LogStreamRequest {
	    namespace: string;
	    podName: string;
	    containerName: string;
	    tailLines?: number;
	    follow: boolean;
	    timestamps: boolean;
	    sinceSeconds?: number;
	    previous?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LogStreamRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.namespace = source["namespace"];
	        this.podName = source["podName"];
	        this.containerName = source["containerName"];
	        this.tailLines = source["tailLines"];
	        this.follow = source["follow"];
	        this.timestamps = source["timestamps"];
	        this.sinceSeconds = source["sinceSeconds"];
	        this.previous = source["previous"];
	    }
	}
	export class Namespace {
	    name: string;
	    status: string;
	    age: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Namespace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.age = source["age"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class NodeSummary {
	    name: string;
	    status: string;
	    roles: string;
	    version: string;
	    internalIp: string;
	    osImage: string;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.roles = source["roles"];
	        this.version = source["version"];
	        this.internalIp = source["internalIp"];
	        this.osImage = source["osImage"];
	        this.age = source["age"];
	    }
	}
	
	export class SecretSummary {
	    name: string;
	    namespace: string;
	    type: string;
	    keysCount: number;
	    age: string;
	
	    static createFrom(source: any = {}) {
	        return new SecretSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.type = source["type"];
	        this.keysCount = source["keysCount"];
	        this.age = source["age"];
	    }
	}
	export class ServiceSummary {
	    name: string;
	    namespace: string;
	    type: string;
	    clusterIp: string;
	    externalIp: string;
	    ports: string;
	    age: string;
	    selector?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ServiceSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.type = source["type"];
	        this.clusterIp = source["clusterIp"];
	        this.externalIp = source["externalIp"];
	        this.ports = source["ports"];
	        this.age = source["age"];
	        this.selector = source["selector"];
	    }
	}
	export class StatefulSetSummary {
	    name: string;
	    namespace: string;
	    status: string;
	    ready: string;
	    readyReplicas: number;
	    totalReplicas: number;
	    age: string;
	    serviceName: string;
	
	    static createFrom(source: any = {}) {
	        return new StatefulSetSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.ready = source["ready"];
	        this.readyReplicas = source["readyReplicas"];
	        this.totalReplicas = source["totalReplicas"];
	        this.age = source["age"];
	        this.serviceName = source["serviceName"];
	    }
	}
	export class WorkloadCache {
	
	
	    static createFrom(source: any = {}) {
	        return new WorkloadCache(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}

}

