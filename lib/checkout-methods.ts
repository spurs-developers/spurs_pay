// lib/checkout-methods.ts
import "server-only";
import type { Merchant } from "@/lib/db";
import type { PaymentMethod } from "@/lib/providers/types";
import { resolveProvider } from "@/lib/providers";
import { getAdminConfig } from "@/lib/admin-config";

/**
 * What's actually offered at checkout = admin's platform ceiling
 * ∩ the merchant's own choice ∩ what the configured processor supports.
 * Any layer can only remove a method, never add one back.
 */
export async function enabledMethods(
  merchant: Pick<Merchant, "allowedMethods"> | null,
  mode: "test" | "live" = "live",
): Promise<PaymentMethod[]> {
  const cfg = await getAdminConfig();
  const platform = new Set(
    (cfg.PAY_ALLOWED_METHODS ?? "card,bank_transfer,ussd").split(","),
  );
  const merchantAllowed = new Set(
    (merchant?.allowedMethods ?? "card,bank_transfer,ussd").split(","),
  );
  const provider = await resolveProvider(mode);
  return provider.supportedMethods.filter(
    (m) => platform.has(m) && merchantAllowed.has(m),
  );
}