import "server-only";

/**
 * Reads this app's configuration/credentials from the Spurs admin control plane
 * instead of local env. Admin is the source of truth; the only local secret is
 * the bootstrap used to authenticate here. Cached briefly and fails soft.
 */
const BASE = (process.env.SPURS_ADMIN_URL ?? "http://127.0.0.1:3300").replace(/\/$/, "");
const SECRET = process.env.SPURS_ADMIN_SECRET ?? "";
const APP = process.env.SPURS_ADMIN_APP ?? "pay";
const TTL_MS = 60_000;

type Cache = { at: number; config: Record<string, string> };
const g = globalThis as unknown as { _payAdminCfg?: Cache };

export async function getAdminConfig(): Promise<Record<string, string>> {
  const now = Date.now();
  if (g._payAdminCfg && now - g._payAdminCfg.at < TTL_MS) return g._payAdminCfg.config;

  let config: Record<string, string> = {};
  if (SECRET) {
    try {
      const res = await fetch(`${BASE}/api/config?app=${APP}`, {
        headers: { "x-admin-bootstrap": SECRET, Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (res.ok) {
        const body = await res.json();
        if (body?.config && typeof body.config === "object") config = body.config;
      }
    } catch {
      // admin unreachable — fall back to whatever the caller merges from env.
    }
  }

  g._payAdminCfg = { at: now, config };
  return config;
}
