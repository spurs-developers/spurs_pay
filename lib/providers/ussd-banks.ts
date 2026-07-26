import type { Bank } from "./types";

/** Banks that support Flutterwave's USSD charge type. The code is the same
 * bank code used for transfers/payouts — USSD charges reuse it as `account_bank`. */
export const USSD_BANKS: Bank[] = [
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "United Bank for Africa", code: "033" },
  { name: "Access Bank", code: "044" },
  { name: "Zenith Bank", code: "057" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "Fidelity Bank", code: "070" },
  { name: "Sterling Bank", code: "232" },
  { name: "Wema Bank", code: "035" },
  { name: "Union Bank", code: "032" },
  { name: "FCMB", code: "214" },
];

/** Real dial prefixes — used by the sandbox provider so test mode dials
 * something that looks like the real bank's USSD string. */
export const USSD_DIAL_PREFIX: Record<string, string> = {
  "058": "*737*", "033": "*919*", "044": "*901*", "057": "*966*",
  "011": "*894*", "070": "*770*", "232": "*822*", "035": "*945*",
  "032": "*826*", "214": "*329*",
};