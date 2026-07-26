import "server-only";

const BASE = (process.env.SPURS_ACCOUNTS_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const SECRET = process.env.INTERNAL_API_SECRET ?? "";

/**
 * Fetch a user's verified BVN from Accounts over the internal secret channel.
 * Fails soft so virtual-account provisioning still proceeds when Accounts is
 * unavailable or the user is not BVN-verified.
 */
export async function getUserBvn(userId: string): Promise<string | null> {
  if (!SECRET) return null;

  try {
    const res = await fetch(`${BASE}/internal/users/${encodeURIComponent(userId)}/bvn`, {
      headers: { Accept: "application/json", "x-internal-secret": SECRET },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.json().catch(() => null);
    return typeof body?.bvn === "string" ? body.bvn : null;
  } catch {
    return null;
  }
}
