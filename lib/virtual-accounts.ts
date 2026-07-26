import { db, virtualAccounts, merchants } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { resolveProvider } from "./providers";
import { Mode } from "./mode";

export async function listVirtualAccounts(merchantId: string) {
  return db.select().from(virtualAccounts).where(eq(virtualAccounts.merchantId, merchantId)).orderBy(desc(virtualAccounts.createdAt));
}

/** Assign a dedicated collection account. In sandbox we mint a NUBAN-like number;
 *  real providers return a partner-bank virtual account. */
export async function createVirtualAccount(merchantId: string, label: string, mode: Mode = "live") {
  const [m] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const provider = await resolveProvider(mode);
  if (!provider.createVirtualAccount) {
    throw new Error(`${provider.name} doesn't support virtual accounts`);
  }

  const result = await provider.createVirtualAccount({
    reference: merchantId,
    customerName: m?.businessName ?? "Merchant",
    customerEmail: m?.email ?? undefined,
  });
  const [va] = await db
    .insert(virtualAccounts)
    .values({
      merchantId,
      label: label || "Collections",
      bankName: "Spurs Test Bank",
      accountNumber: String(randomInt(1_000_000_000, 9_999_999_999)),
      accountName: `SPURS PAY / ${(m?.businessName ?? "MERCHANT").toUpperCase()}`,
    })
    .returning();
  return va;
}

export async function setVirtualAccountActive(merchantId: string, id: string, active: boolean) {
  await db.update(virtualAccounts).set({ active }).where(eq(virtualAccounts.id, id));
}
