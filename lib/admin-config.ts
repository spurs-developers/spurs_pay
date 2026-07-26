import "server-only";

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

  if (!SECRET) {
    console.warn("[admin-config] SPURS_ADMIN_SECRET is not set — skipping admin lookup, using env vars only");
  } else {
    try {
      const res = await fetch(`${BASE}/api/config?app=${APP}`, {
        headers: { "x-admin-bootstrap": SECRET, Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error(`[admin-config] admin returned ${res.status} for app=${APP} at ${BASE}`);
      } else {
        const body = await res.json();
        if (body?.config && typeof body.config === "object") {
          config = body.config;
        } else {
          console.error(`[admin-config] admin response for app=${APP} had no usable config field:`, body);
        }
      }
    } catch (e) {
      console.error(`[admin-config] failed to reach admin at ${BASE} for app=${APP}:`, e instanceof Error ? e.message : e);
    }
  }

  g._payAdminCfg = { at: now, config };
  return config;
}