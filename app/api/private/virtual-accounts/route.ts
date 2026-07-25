import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeInternalService } from "@/lib/api/internal-guard";
import { resolveProvider } from "@/lib/providers";

// POST /api/private/virtual-accounts  { reference, customerName, mode? }
// Provisions a dedicated NUBAN through the configured processor. Trusted Spurs
// services (the Wallet) call this to give a user a bank-transfer funding account.
const Schema = z.object({
  reference: z.string().min(1),          // the owner (Spurs user id)
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  currency: z.string().optional(),
  mode: z.enum(["test", "live"]).optional(),
});

export async function POST(req: NextRequest) {
  const auth = authorizeInternalService(req);
  if (!auth.ok) return auth.error;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const provider = await resolveProvider(parsed.data.mode ?? "live");
  if (!provider.createVirtualAccount) {
    return NextResponse.json({ error: "Virtual accounts are unavailable" }, { status: 400 });
  }

  try {
    const account = await provider.createVirtualAccount(parsed.data);
    // providerRef is internal — the caller only needs the bank details.
    return NextResponse.json({ data: { bankName: account.bankName, accountNumber: account.accountNumber, accountName: account.accountName } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
