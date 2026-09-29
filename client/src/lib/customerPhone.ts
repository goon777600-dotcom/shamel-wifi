export type PhoneCountryCode = "YE" | "SA";

export const PHONE_COUNTRIES: Record<PhoneCountryCode, { label: string; dialCode: string; localLength: number }> = {
  YE: { label: "اليمن +967", dialCode: "967", localLength: 9 },
  SA: { label: "السعودية +966", dialCode: "966", localLength: 9 },
};

export function parseCustomerPhone(phone?: string | null): { country: PhoneCountryCode; localNumber: string } {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (digits.startsWith("966")) return { country: "SA", localNumber: digits.slice(3).replace(/^0/, "") };
  if (digits.startsWith("967")) return { country: "YE", localNumber: digits.slice(3).replace(/^0/, "") };
  return { country: "YE", localNumber: digits.replace(/^0/, "") };
}

export function formatCustomerPhone(localNumber: string, country: PhoneCountryCode) {
  const digits = localNumber.replace(/\D/g, "").replace(/^0/, "");
  return digits ? `+${PHONE_COUNTRIES[country].dialCode}${digits}` : "";
}
