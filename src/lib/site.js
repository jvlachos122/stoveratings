export const site = {
  name: "StoveRatings",
  legalName: "Three Pines Company LLC",
  url: "https://stoveratings.com",
  locale: "en_US",
  description:
    "EPA test numbers for every certified wood and pellet stove: emissions, HHV efficiency, and heat output from the public EPA database.",
  contactEmail: "hello@stoveratings.com",
  epaDatabaseUrl: "https://www.epa.gov/compliance/epa-certified-wood-heater-database",
  tagline: "EPA test numbers for every certified wood and pellet stove.",
};

export function contactEmail() {
  const email = String(site.contactEmail || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}
