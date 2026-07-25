import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authorizeInternalService } from "@/lib/api/internal-guard";
import { resolveProvider } from "@/lib/providers";

/**
 * POST /api/private/payouts — platform payout to a bank account.
 *
 * For trusted first-party services (Spurs Wallet withdrawals). Unlike the
 * merchant payout API this has no merchant-balance gate: the caller is the
 * system of record for the funds and has already debited its own ledger, so Pay
 * acts purely as the bank rail. Pay keeps the processor hidden either way.
 */
const Schema = z.object({
  bankCode: z.string().min(1),
  accountNumber: z.string().min(4),
  accountName: z.string().optional(),
  amount: z.number().int().positive(),  // minor units
  currency: z.string().length(3).optional(),
  narration: z.string().max(140).optional(),
  reference: z.string().min(3).max(100).optional(),
  mode: z.enum(["test", "live"]).optional(),
});

export async function POST(req: NextRequest) {
  const auth = authorizeInternalService(req);
  if (!auth.ok) return auth.error;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  const mode = input.mode ?? "live";
  const provider = await resolveProvider(mode);
  if (!provider.transfer) return NextResponse.json({ error: "Payouts are unavailable" }, { status: 501 });

  const reference = input.reference ?? "spo_" + randomBytes(12).toString("hex");
  const currency = input.currency ?? "NGN";

  // Resolve the account name when the caller didn't supply one.
  let accountName = input.accountName;
  if (!accountName && provider.resolveAccount) {
    accountName = (await provider.resolveAccount(input.bankCode, input.accountNumber))?.accountName;
  }

  try {
    const result = await provider.transfer({
      amount: input.amount,
      currency,
      reference,
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      accountName: accountName ?? "Spurs user",
      narration: input.narration,
    });
    return NextResponse.json({
      reference,
      status: result.status,
      providerReference: result.providerReference ?? null,
      accountName: accountName ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, reference }, { status: 502 });
  }
}
