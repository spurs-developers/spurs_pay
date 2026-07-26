import { db, payments, payouts, recipients, merchants, type Payout, type Recipient } from "@/lib/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { resolveProvider } from "@/lib/providers";

/* ------------------------------- balance -------------------------------- */

export interface Balance {
  /** Collected from successful payments, minus refunds. */
  collected: number;
  /** Paid out or in flight. */
  paidOut: number;
  /** What the merchant can actually withdraw right now. */
  available: number;
  currency: string;
}

/**
 * Derive the merchant's balance from the ledgers we already keep:
 *   available = successful payments − refunds − (successful + pending payouts)
 *
 * Pending payouts are held back so the same money can't be sent twice.
 */
export async function getBalance(merchantId: string, currency = "NGN", mode: "test" | "live" = "live"): Promise<Balance> {
  const [paid, sent] = await Promise.all([
    db.select().from(payments).where(eq(payments.merchantId, merchantId)),
    db.select().from(payouts).where(eq(payouts.merchantId, merchantId)),
  ]);

  let collected = 0;
  for (const p of paid) {
    if (p.currency !== currency || p.mode !== mode) continue;
    if (p.status === "successful" || p.status === "refunded" || p.status === "partially_refunded") {
      collected += p.amount - (p.refundedAmount ?? 0);
    }
  }

  let paidOut = 0;
  for (const p of sent) {
    if (p.currency !== currency || p.mode !== mode) continue;
    if (p.status === "successful" || p.status === "pending") paidOut += p.amount;
  }

  return { collected, paidOut, available: collected - paidOut, currency };
}

/* ------------------------------ recipients ------------------------------ */

export async function listBanks(mode: "test" | "live" = "live") {
  const provider = await resolveProvider(mode);
  return provider.listBanks ? provider.listBanks() : [];
}

/** Confirm who owns an account before any money moves. */
export async function resolveAccount(bankCode: string, accountNumber: string, mode: "test" | "live" = "live"): Promise<{ accountName: string } | null> {
  const provider = await resolveProvider(mode);
  if (!provider.resolveAccount) throw new Error("Account resolution is unavailable");
  return provider.resolveAccount(bankCode, accountNumber);
}

export async function listRecipients(merchantId: string): Promise<Recipient[]> {
  return db.select().from(recipients).where(eq(recipients.merchantId, merchantId)).orderBy(desc(recipients.createdAt));
}

export async function getRecipient(merchantId: string, id: string): Promise<Recipient | null> {
  const [r] = await db
    .select()
    .from(recipients)
    .where(and(eq(recipients.id, id), eq(recipients.merchantId, merchantId)))
    .limit(1);
  return r ?? null;
}

/** Save a payout destination. The account name is resolved, never user-supplied. */
export async function createRecipient(
  merchantId: string,
  input: { name?: string; bankCode: string; accountNumber: string },
): Promise<Recipient> {
  const banks = await listBanks();
  const bank = banks.find((b) => b.code === input.bankCode);
  if (!bank) throw new Error("Unknown bank");

  const resolved = await resolveAccount(input.bankCode, input.accountNumber);
  if (!resolved) throw new Error("Could not resolve that account number");

  const [r] = await db
    .insert(recipients)
    .values({
      merchantId,
      name: input.name?.trim() || resolved.accountName,
      bankName: bank.name,
      bankCode: bank.code,
      accountNumber: input.accountNumber,
      accountName: resolved.accountName,
    })
    .returning();
  return r;
}

export async function deleteRecipient(merchantId: string, id: string): Promise<void> {
  // Kept if any payout references it — the FK is `restrict` on purpose.
  await db.delete(recipients).where(and(eq(recipients.id, id), eq(recipients.merchantId, merchantId)));
}

/* -------------------------------- payouts ------------------------------- */

export async function listPayouts(merchantId: string, limit = 100): Promise<Payout[]> {
  return db
    .select()
    .from(payouts)
    .where(eq(payouts.merchantId, merchantId))
    .orderBy(desc(payouts.createdAt))
    .limit(limit);
}

export async function getPayout(reference: string): Promise<Payout | null> {
  const [p] = await db.select().from(payouts).where(eq(payouts.reference, reference)).limit(1);
  return p ?? null;
}

/** Recipients for a set of payouts, for display. */
export async function recipientsFor(payoutList: Payout[]): Promise<Map<string, Recipient>> {
  const ids = [...new Set(payoutList.map((p) => p.recipientId))];
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(recipients).where(inArray(recipients.id, ids));
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Send money to a saved recipient.
 *
 * The payout row is written *before* calling the provider so the funds are
 * reserved (pending payouts reduce the available balance) — otherwise two
 * concurrent requests could each pass the balance check and overdraw.
 */
export async function createPayout(
  merchantId: string,
  input: { recipientId: string; amount: number; narration?: string; mode?: "test" | "live" },
): Promise<Payout> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Amount must be a positive integer (minor units)");
  }
  const mode = input.mode ?? "live";

  const recipient = await getRecipient(merchantId, input.recipientId);
  if (!recipient) throw new Error("Recipient not found");

  const balance = await getBalance(merchantId, recipient.currency, mode);
  if (input.amount > balance.available) {
    throw new Error("Insufficient balance for this payout");
  }

  const provider = await resolveProvider(mode);
  if (!provider.transfer) throw new Error("Payouts are unavailable");

  const [ma] = await db
    .select({ prefix: merchants.transactionPrefix, suffix: merchants.transactionSuffix })
    .from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const reference = (ma?.prefix ?? "spo_") + randomBytes(12).toString("hex") + (ma?.suffix ?? "");
  const [pending] = await db
    .insert(payouts)
    .values({
      merchantId,
      recipientId: recipient.id,
      reference,
      mode,
      amount: input.amount,
      currency: recipient.currency,
      narration: input.narration ?? null,
    })
    .returning();

  let result;
  try {
    result = await provider.transfer({
      amount: input.amount,
      currency: recipient.currency,
      reference,
      bankCode: recipient.bankCode,
      accountNumber: recipient.accountNumber,
      accountName: recipient.accountName,
      narration: input.narration,
    });
  } catch (e) {
    const [failed] = await db
      .update(payouts)
      .set({ status: "failed", failureReason: (e as Error).message, completedAt: new Date() })
      .where(eq(payouts.reference, reference))
      .returning();
    return failed ?? pending;
  }

  const [settled] = await db
    .update(payouts)
    .set({
      status: result.status,
      provider: provider.name,
      providerReference: result.providerReference,
      failureReason: result.status === "failed" ? (result.message ?? "Transfer failed") : null,
      completedAt: result.status === "pending" ? null : new Date(),
    })
    .where(eq(payouts.reference, reference))
    .returning();

  return settled ?? pending;
}

/** Public shape — never leaks which processor moved the money. */
export function publicPayout(p: Payout, recipient?: Recipient) {
  return {
    reference: p.reference,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    narration: p.narration,
    failureReason: p.failureReason,
    createdAt: p.createdAt,
    completedAt: p.completedAt,
    recipient: recipient
      ? {
          id: recipient.id,
          name: recipient.name,
          bankName: recipient.bankName,
          accountNumber: recipient.accountNumber,
          accountName: recipient.accountName,
        }
      : undefined,
  };
}
