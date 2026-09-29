const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;
const RATE_PATTERN = /^\d+(?:\.\d{1,6})?$/;
const QUANTITY_PATTERN = /^\d+(?:\.\d{1,3})?$/;

function parseFixed(value: string, scale: number, pattern: RegExp, label: string): bigint {
  const normalized = value.trim();
  if (!pattern.test(normalized)) {
    throw new Error(`${label} غير صالح`);
  }

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(scale, "0");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(paddedFraction || "0");
}

export function moneyToCents(value: string): bigint {
  return parseFixed(value, 2, MONEY_PATTERN, "المبلغ");
}

export function rateToMicros(value: string): bigint {
  return parseFixed(value, 6, RATE_PATTERN, "سعر الصرف");
}

export function quantityToMillis(value: string): bigint {
  return parseFixed(value, 3, QUANTITY_PATTERN, "الكمية");
}

export function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function millisToQuantity(millis: bigint): string {
  const whole = millis / 1000n;
  const fraction = (millis % 1000n).toString().padStart(3, "0");
  return `${whole}.${fraction}`;
}

export function roundDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("القاسم يجب أن يكون أكبر من صفر");
  return (numerator + denominator / 2n) / denominator;
}

export function calculateLineTotal(unitPriceCents: bigint, quantityMillis: bigint): bigint {
  return roundDivide(unitPriceCents * quantityMillis, 1000n);
}

export function convertToBaseCents(amountCents: bigint, exchangeRateMicros: bigint): bigint {
  return roundDivide(amountCents * exchangeRateMicros, 1_000_000n);
}

export function convertFromBaseCents(baseAmountCents: bigint, exchangeRateMicros: bigint): bigint {
  if (exchangeRateMicros <= 0n) throw new Error("سعر الصرف يجب أن يكون أكبر من صفر");
  return roundDivide(baseAmountCents * 1_000_000n, exchangeRateMicros);
}

export function getCreditInvoiceStatus(totalCents: bigint, paidCents: bigint): "issued" | "partially_paid" | "paid" {
  if (paidCents >= totalCents) return "paid";
  if (paidCents > 0n) return "partially_paid";
  return "issued";
}

export function canAllocateReceipt(totalCents: bigint, alreadyPaidCents: bigint, allocationCents: bigint): boolean {
  return allocationCents > 0n && alreadyPaidCents >= 0n && alreadyPaidCents + allocationCents <= totalCents;
}

export function hasSufficientCash(balanceCents: bigint, withdrawalCents: bigint): boolean {
  return withdrawalCents > 0n && balanceCents >= withdrawalCents;
}

export function sumCents(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}
