export const CONTACT_TYPE_OPTIONS = [
  { value: "customer", label: "عميل فردي" },
  { value: "grocery", label: "بقالة" },
  { value: "supplier", label: "التجار" },
  { value: "employee", label: "موظف" },
  { value: "other", label: "حساب عام" },
] as const;

export type ContactType = (typeof CONTACT_TYPE_OPTIONS)[number]["value"];

export const contactTypeLabel: Record<ContactType, string> = Object.fromEntries(
  CONTACT_TYPE_OPTIONS.map(option => [option.value, option.label]),
) as Record<ContactType, string>;
