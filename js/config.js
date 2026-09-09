/* ─────────────────────────────────────────────────────────────
   VOUWLOODS — seller config
   Change these before you share the site on Marktplaats.
   ───────────────────────────────────────────────────────────── */
window.VOUW = {
  name: "Vouwloods",
  city: "Delft",
  region: { nl: "Zuid-Holland", en: "South Holland" },
  /* International format, no + or spaces. Example: 31612345678 */
  whatsapp: "31682580785",
  marktplaatsProfile: "https://www.marktplaats.nl/v/fietsen-en-brommers/fietsen-vouwfietsen/m2437999320-2x-tern-link-aluminium-vouwfietsen-met-7-versnellingen",
  pickupHours: { nl: "Op afspraak, 7 dagen", en: "By appointment, 7 days" },
  payment: { nl: "Tikkie, contant of instant Revolut/SEPA bij afhalen", en: "Tikkie (Dutch bank), cash, or instant Revolut / SEPA at pickup" },
  /* Contact Email for direct buyer inquiries */
  email: "kirannreddyaero@gmail.com",
  /* Set true after you replace demo bikes with your real stock */
  demoInventory: false,
  /* Live Bid Synchronization (Serverless / Cloud)
     Works with free Firebase Realtime Database, Supabase, or any custom REST endpoint.
     If endpoint is empty or offline, automatically falls back to browser localStorage. */
  bidSync: {
    enabled: true,
    provider: "firebase", // "firebase" | "rest" | "none"
    endpoint: "", // e.g. "https://<PROJECT-ID>.firebasedatabase.app/bids"
    pollIntervalMs: 30000,
  },
};
