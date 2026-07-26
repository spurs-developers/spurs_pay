"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMerchant } from "@/lib/auth";
import { getMode, type Mode } from "@/lib/mode";
import { createMerchantKey, revokeKey, updateMerchant, regenerateWebhookSecret } from "@/lib/merchants";
import { refundPayment } from "@/lib/refunds";
import { createInvoice, voidInvoice } from "@/lib/invoices";
import { createVirtualAccount } from "@/lib/virtual-accounts";
import { issueCard, setCardFrozen } from "@/lib/cards";
import { createRecipient, createPayout } from "@/lib/transfers";
import { redeliver } from "@/lib/webhooks";

export async function createKeyAction(name: string, mode: "test" | "live" = "test"): Promise<{ key: string }> {
  const m = await requireMerchant();
  const safeMode = mode === "live" ? "live" : "test";
  const { key } = await createMerchantKey(m.sub, name.trim() || "API key", safeMode);
  revalidatePath("/dashboard/keys");
  return { key };
}

export async function revokeKeyAction(keyId: string) {
  const m = await requireMerchant();
  await revokeKey(m.sub, keyId);
  revalidatePath("/dashboard/keys");
}

export async function saveSettingsAction(formData: FormData) {
  const m = await requireMerchant();
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  // Keep only the known payment methods, in a stable order.
  const picked = new Set(formData.getAll("methods").map(String));
  const methods = ["card", "bank_transfer", "ussd", "wallet"].filter((x) => picked.has(x));

  await updateMerchant(m.sub, {
    businessName: str("businessName") || undefined,
    webhookUrl: str("webhookUrl") || null,
    allowedMethods: methods.join(","),
  });
  revalidatePath("/dashboard/settings");
}

export async function regenSecretAction() {
  const m = await requireMerchant();
  await regenerateWebhookSecret(m.sub);
  revalidatePath("/dashboard/settings");
}

export async function redeliverWebhookAction(id: string) {
  const m = await requireMerchant();
  await redeliver(id, m.sub);
  revalidatePath("/dashboard/webhooks");
}

/** Switch the dashboard between test and live views. */
export async function setModeAction(mode: Mode) {
  await requireMerchant();
  const c = await cookies();
  c.set("pay_mode", mode === "live" ? "live" : "test", { path: "/", sameSite: "lax" });
  revalidatePath("/dashboard", "layout");
}

export async function refundAction(reference: string, amountMinor?: number, reason?: string) {
  const m = await requireMerchant();
  await refundPayment(m.sub, reference, amountMinor, reason);
  revalidatePath(`/dashboard/payments/${reference}`);
  revalidatePath("/dashboard/payments");
}

export async function createRecipientAction(formData: FormData) {
  const m = await requireMerchant();
  const mode = await getMode();
  const bankCode = String(formData.get("bankCode") ?? "");
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || undefined;

  try {
    await createRecipient(m.sub, { bankCode, accountNumber, name }, mode);
  } catch (e) {
    redirect(`/dashboard/payouts?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/dashboard/payouts");
  redirect("/dashboard/payouts?ok=Recipient+saved");
}

export async function createPayoutAction(formData: FormData) {
  const m = await requireMerchant();
  const recipientId = String(formData.get("recipientId") ?? "");
  const amount = Math.round(Number(formData.get("amount")) * 100); // major → minor
  const narration = String(formData.get("narration") ?? "").trim() || undefined;

  if (!recipientId) redirect("/dashboard/payouts?error=Choose+a+recipient");
  if (!Number.isInteger(amount) || amount <= 0) redirect("/dashboard/payouts?error=Enter+a+valid+amount");

  try {
    await createPayout(m.sub, { recipientId, amount, narration });
  } catch (e) {
    redirect(`/dashboard/payouts?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/dashboard/payouts");
  redirect("/dashboard/payouts?ok=Payout+sent");
}

export async function createInvoiceAction(formData: FormData) {
  const m = await requireMerchant();
  const email = String(formData.get("customerEmail") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount")) * 100);
  const description = String(formData.get("description") ?? "").trim() || undefined;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  if (!email.includes("@") || !Number.isInteger(amount) || amount <= 0) {
    redirect("/dashboard/invoices?error=Enter+a+valid+email+and+amount");
  }
  const invoice = await createInvoice(m.sub, { customerEmail: email, amount, description, dueDate: dueRaw ? new Date(dueRaw) : null });
  redirect(`/dashboard/invoices/${invoice.id}`);
}

export async function voidInvoiceAction(id: string) {
  const m = await requireMerchant();
  await voidInvoice(m.sub, id);
  revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard/invoices");
}

export async function createVirtualAccountAction(formData: FormData) {
  const m = await requireMerchant();
  await createVirtualAccount(m.sub, String(formData.get("label") ?? "").trim());
  revalidatePath("/dashboard/virtual-accounts");
}

export async function issueCardAction(formData: FormData) {
  const m = await requireMerchant();
  const balance = Math.round(Number(formData.get("balance") ?? 0) * 100) || 0;
  await issueCard(m.sub, String(formData.get("label") ?? "").trim(), balance);
  revalidatePath("/dashboard/cards");
}

export async function toggleCardAction(id: string, frozen: boolean) {
  const m = await requireMerchant();
  await setCardFrozen(m.sub, id, frozen);
  revalidatePath("/dashboard/cards");
}
