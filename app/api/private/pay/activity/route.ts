import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, payments } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * "Did this person pay through Spurs Pay, and did they do it after time T?"
 *
 * Spurs Earn asks this to verify an earn-by-doing task. Payments are merchant
 * scoped and carry a customer email rather than a Spurs user id, so the email
 * is the link — the caller is trusted (internal secret) and passes the address
 * off the user's authenticated session, not off user input.
 *
 * Only live, successful payments count: a test-mode payment moves no real
 * money and must never earn a reward.
 */
const Body = z.object({
  email: z.string().email(),
  kind: z.enum(["payment"]).default("payment"),
  since: z.coerce.date().optional(),
  minAmount: z.coerce.number().optional(),
});

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || req.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { email, since, minAmount } = parsed.data;

  const [r] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${payments.amount}), 0)::text`,
      largest: sql<string>`coalesce(max(${payments.amount}), 0)::text`,
      latest: sql<Date | null>`max(${payments.paidAt})`,
    })
    .from(payments)
    .where(and(
      sql`lower(${payments.customerEmail}) = ${email.toLowerCase()}`,
      eq(payments.status, "successful"),
      eq(payments.mode, "live"),
      ...(since ? [gt(payments.paidAt, since)] : []),
      ...(minAmount ? [sql`${payments.amount} >= ${minAmount}`] : []),
    ));

  return NextResponse.json({
    ok: true,
    count: Number(r.count),
    totalMinor: r.total,
    largestMinor: r.largest,
    latestAt: r.latest,
  });
}
