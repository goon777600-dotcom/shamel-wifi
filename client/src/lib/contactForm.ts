import { formatCustomerPhone, type PhoneCountryCode } from "./customerPhone";
import type { ContactType } from "./contactTypes";

export type ContactFormPayload = {
  name: string;
  type: ContactType;
  phone: string;
  address: string;
  notes: string;
};

export function buildContactFormPayload(form: ContactFormPayload, country: PhoneCountryCode): ContactFormPayload {
  return { ...form, phone: formatCustomerPhone(form.phone, country) };
}
