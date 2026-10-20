/** Central branding for WowBingo. */
export const BRAND = {
  name: "WowBingo",
  nameCompact: "WowBingo",
  shortName: "Wow",
  logoLetter: "W",
  titleSuffix: "WowBingo",
  tagline: "Your next winning number",
  welcomeTitle: "WELCOME TO WOWBINGO",
  welcomeSubtitle: "Pick a room, grab your cards, and start winning.",
  supportEmail: "support@candybingo.com",
  supportTelegram: "ab1221hb",
  telegramBot: "CandyBingoBot",
  promoImage: "/instant-bingo-promo.png",
} as const;

export function pageTitle(label: string): string {
  return `${label} | ${BRAND.titleSuffix}`;
}
