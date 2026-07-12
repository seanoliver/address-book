import "server-only";
import { type ContactInput } from "@/lib/validation/contact";

/**
 * Parsed contact input → drizzle column values (cleared optionals become
 * NULL). Shared by the single-contact CRUD actions and the CSV import.
 */
export function contactInputToRow(d: ContactInput) {
  return {
    fullName: d.full_name,
    partnerName: d.partner_name ?? null,
    kidsNames: d.kids_names ?? null,
    email: d.email ?? null,
    birthday: d.birthday ?? null,
    addressLine1: d.address_line1 ?? null,
    addressLine2: d.address_line2 ?? null,
    city: d.city ?? null,
    stateRegion: d.state_region ?? null,
    postalCode: d.postal_code ?? null,
    country: d.country ?? null,
    notes: d.notes ?? null,
  };
}
