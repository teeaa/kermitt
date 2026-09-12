export type EnvironmentType = "production" | "staging" | "dev" | "local" | "default";

export interface EnvironmentInfo {
  isProd: boolean;
  isNonProd: boolean;
  envType: EnvironmentType;
  badgeLabel: string | null;
  badgeStyle: string;
  itemTextClass: string;
  triggerBorderClass: string;
}

const PROD_REGEX = /(prod|production|live|main|prd)/i;
const NON_PROD_QUALIFIERS = /(test|qa|dev|staging|stage|local|mock|sandbox|demo)/i;
const STAGING_REGEX = /(staging|stage|qa)/i;
const LOCAL_REGEX = /(local|kind|minikube|k3d|docker-desktop)/i;
const DEV_REGEX = /(dev|development|test)/i;

/**
 * Classifies a Kubernetes context name into an environment tier (Production, Staging, Dev, Local, Default)
 * and returns visual styling tokens for dropdown items and the top bar trigger button.
 */
export function classifyEnvironment(contextName: string): EnvironmentInfo {
  if (!contextName) {
    return {
      isProd: false,
      isNonProd: false,
      envType: "default",
      badgeLabel: null,
      badgeStyle: "",
      itemTextClass: "text-slate-200",
      triggerBorderClass: "border-slate-800 hover:border-slate-700 bg-slate-950",
    };
  }

  const cleanName = contextName.trim().toLowerCase();

  // Check if context name matches production patterns
  const matchesProd = PROD_REGEX.test(cleanName);
  const hasNonProdQualifier = NON_PROD_QUALIFIERS.test(cleanName);

  // If it contains "prod" or "live", ensure it's not explicitly qualified like "prod-test", "test-prod", "dev-prod"
  const isProd = matchesProd && !hasNonProdQualifier;

  if (isProd) {
    const isLive = /live/i.test(cleanName);
    return {
      isProd: true,
      isNonProd: false,
      envType: "production",
      badgeLabel: isLive ? "LIVE" : "PROD",
      badgeStyle:
        "bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wide",
      itemTextClass: "text-rose-400 font-medium",
      triggerBorderClass:
        "border-rose-500/50 bg-rose-950/20 text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-950/30",
    };
  }

  // Check non-production tiers
  if (STAGING_REGEX.test(cleanName)) {
    const isQa = /qa/i.test(cleanName);
    return {
      isProd: false,
      isNonProd: true,
      envType: "staging",
      badgeLabel: isQa ? "QA" : "STAGE",
      badgeStyle:
        "bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] px-1.5 py-0.5 rounded font-semibold",
      itemTextClass: "text-amber-300 font-medium",
      triggerBorderClass: "border-slate-800 hover:border-slate-700 bg-slate-950",
    };
  }

  if (LOCAL_REGEX.test(cleanName)) {
    return {
      isProd: false,
      isNonProd: true,
      envType: "local",
      badgeLabel: "LOCAL",
      badgeStyle:
        "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] px-1.5 py-0.5 rounded font-semibold",
      itemTextClass: "text-cyan-300 font-medium",
      triggerBorderClass: "border-slate-800 hover:border-slate-700 bg-slate-950",
    };
  }

  if (DEV_REGEX.test(cleanName)) {
    return {
      isProd: false,
      isNonProd: true,
      envType: "dev",
      badgeLabel: "DEV",
      badgeStyle:
        "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded font-semibold",
      itemTextClass: "text-emerald-400 font-medium",
      triggerBorderClass: "border-slate-800 hover:border-slate-700 bg-slate-950",
    };
  }

  return {
    isProd: false,
    isNonProd: false,
    envType: "default",
    badgeLabel: null,
    badgeStyle: "",
    itemTextClass: "text-slate-200",
    triggerBorderClass: "border-slate-800 hover:border-slate-700 bg-slate-950",
  };
}
