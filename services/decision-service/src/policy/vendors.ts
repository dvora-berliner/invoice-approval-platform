// Decided server-side, not trusted from submission input (a submitter could otherwise just
// claim vendorKnown: true). Static seed for now - TODO: real vendor registry.
const KNOWN_VENDORS = new Set(
  [
    "Bistro 19",
    "Atlassian",
    "The Rooftop Grill",
    "Dell",
    "Trattoria Verde",
    "Office Depot",
    "Hotel Adler",
    "Lakeside Venue",
    "RackSpace Supplies",
    "PixelForge",
    "ExpoWorks",
    "City Cabs",
    "Logitech",
    "DataDog",
    "Lufthansa",
  ].map((v) => v.toLowerCase())
);

export function isVendorKnown(vendor: string): boolean {
  return KNOWN_VENDORS.has(vendor.trim().toLowerCase());
}
