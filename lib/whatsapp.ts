import { isMobile, normalizePhone } from "./format";

const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME || "us";

type Msg = { customer_name: string; so_no: string; do_no: string; driverName?: string };

// "GPS-00030822 (GPD-00044690)", or just the DO number for special DOs with no SO.
const ref = (m: Msg) => (m.so_no ? `${m.so_no} (${m.do_no})` : m.do_no);

// Edit these to match how your company talks to customers (BM / English / both).
export const MESSAGES = {
  out_for_delivery: (m: Msg) =>
    `Hi ${m.customer_name}, your order ${ref(m)} from ${COMPANY} is on the way today` +
    (m.driverName ? ` with our driver ${m.driverName}` : "") +
    `. Thank you!`,
  delivered: (m: Msg) =>
    `Hi ${m.customer_name}, your order ${ref(m)} has been delivered. ` +
    `Thank you for choosing ${COMPANY}!`,
};

/** Returns a wa.me link that opens WhatsApp with the message pre-filled, or null if no mobile number. */
export function whatsappLink(rawPhone: string | null, text: string): string | null {
  const phone = normalizePhone(rawPhone);
  if (!isMobile(phone)) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
