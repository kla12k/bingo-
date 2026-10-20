import { BRAND } from "./brand";

export type PromoSlideId = "weekly" | "patterns" | "terms";

export type PromoSlide = {
  id: PromoSlideId;
  label: string;
  emoji: string;
};

/** Set false on brands without weekly tournament pages */
export const WEEKLY_PROMO_ENABLED = true;

export const PROMO_SLIDES: PromoSlide[] = [
  ...(WEEKLY_PROMO_ENABLED
    ? [{ id: "weekly" as const, label: "Weekly", emoji: "🏆" }]
    : []),
  { id: "patterns", label: "Patterns", emoji: "🎯" },
  { id: "terms", label: "ደንቦች", emoji: "📋" },
];

export const PROMO_SESSION_KEY = "promo_info_modal_seen_v1";

export function getWeeklyPromoContent() {
  return {
    title: "WEEKLY TOURNAMENT",
    headlineAm: "🔥 የሳምንቱ ታላቅ የቢንጎ ውድድር ተጀምሯል! 🔥",
    headlineEn: `🎱 ${BRAND.name.toUpperCase()}: WEEKLY TOURNAMENT IS LIVE! 🎱`,
    subAm: "🏆 የሳምንቱ አሸናፊ ይሁኑ! ትልቅ ሽልማት ይውሰዱ! ዝግጁ ነዎት?",
    subEn: "The Weekly Winner Takes It All! 💰🍀",
    steps: [
      {
        am: `${BRAND.name} app ይክፈቱ`,
        en: `Open ${BRAND.name}`,
      },
      {
        am: "🏆 Weekly Tournament የሚለውን ይጫኑ",
        en: "Tap Weekly Tournament",
      },
      {
        am: "Weekly Tournament የሚለውን ይምረጡ",
        en: "Select Weekly Tournament",
      },
      {
        am: "Register በማለት ቦታዎን ያረጋግጡ!",
        en: "Tap Register & confirm!",
      },
    ],
    urgencyAm: "⚡️ ፈጥነው ይመዝገቡ! የሳምንቱ ቦታዎች ውስን ናቸው! ⚡️",
    urgencyEn: "⏳ Limited spots available — Don't miss out!",
    registerPath: "/group",
  };
}
