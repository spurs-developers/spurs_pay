import type { PaymentProvider } from "./types";
import { SandboxProvider } from "./sandbox";
import { FlutterwaveProvider } from "./flutterwave";
import { getAdminConfig } from "@/lib/admin-config";

/**
 * Pick the processor for a payment. **Mode decides, not global config:**
 *   - test  → always the sandbox (no real money can ever move)
 *   - live  → the configured real processor, falling back to sandbox until one
 *             is set up, so nothing breaks before go-live
 * The customer/merchant never learns which processor was used.
 */
export async function resolveProvider(mode: "test" | "live" = "test"): Promise<PaymentProvider> {
  if (mode === "test") return new SandboxProvider();

  const cfg = await getAdminConfig();
  const providerId = (cfg.PAY_PROVIDER ?? process.env.PAY_PROVIDER ?? "sandbox").toLowerCase();

  switch (providerId) {
    case "flutterwave":
      return new FlutterwaveProvider(cfg);
    // case "paystack": return new PaystackProvider(cfg);
    default:
      return new SandboxProvider(); // no live processor configured yet
  }
}

export * from "./types";
