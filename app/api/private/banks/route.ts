import { NextRequest, NextResponse } from "next/server";
import { authorizeInternalService } from "@/lib/api/internal-guard";
import { resolveProvider } from "@/lib/providers";

// GET /api/private/banks                                  → { banks: [...] }
// GET /api/private/banks?bankCode=..&accountNumber=..      → { accountName }
// Bank directory + name enquiry for trusted Spurs services (e.g. Wallet
// withdrawals). Keeps the processor hidden behind Pay.
export async function GET(req: NextRequest) {
  const auth = authorizeInternalService(req);
  if (!auth.ok) return auth.error;

  const mode = req.nextUrl.searchParams.get("mode") === "live" ? "live" : "test";
  const provider = await resolveProvider(mode);

  const bankCode = req.nextUrl.searchParams.get("bankCode");
  const accountNumber = req.nextUrl.searchParams.get("accountNumber");

  if (bankCode && accountNumber) {
    if (!provider.resolveAccount) return NextResponse.json({ error: "Name enquiry unavailable" }, { status: 501 });
    const resolved = await provider.resolveAccount(bankCode, accountNumber);
    if (!resolved) return NextResponse.json({ error: "Could not resolve account" }, { status: 404 });
    return NextResponse.json(resolved);
  }

  if (!provider.listBanks) return NextResponse.json({ banks: [] });
  return NextResponse.json({ banks: await provider.listBanks() });
}
