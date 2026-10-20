import { FiCheckCircle, FiInfo, FiLock, FiShield } from "react-icons/fi";
import type { IconType } from "react-icons";
import { BRAND } from "./brand";

export type TermsSection = {
  title: string;
  content: string;
  icon: IconType;
};

export function getTermsSections(): TermsSection[] {
  return [
    {
      title: "1. ደንቦችን መቀበል",
      content: `${BRAND.name}ን በመጠቀም እነዚህን ደንቦችና ሁኔታዎች እንዲሁም የግላዊነት ፖሊሲያችንን በመቀበል ይስማማሉ። ካልተስማሙ እባክዎ አገልግሎታችንን አትጠቀሙ።`,
      icon: FiCheckCircle,
    },
    {
      title: "2. የመሳተፍ መስፈርት",
      content:
        "አካውንት ለመክፈት እና ክፍያ በሚጠይቁ ጨዋታዎች ላይ ለመሳተፍ ቢያንስ የ18 ዓመት (ወይም በሚኖሩበት አካባቢ ህጋዊ የአዋቂነት ዕድሜ ላይ የደረሱ) መሆን አለብዎት። ይህንን ድረ-ገጽ በመጠቀም፣ እነዚህን መስፈርቶች እንደሚያሟሉ ያረጋግጣሉ።",
      icon: FiInfo,
    },
    {
      title: "3. የመለያ ኃላፊነት",
      content:
        "የመለያዎን የይለፍ ቃልና መረጃ ሚስጥራዊ መጠበቅ በእርስዎ ላይ ነው። በመለያዎ ስም የሚካሄዱ ሁሉም ተግባራት በእርስዎ ላይ ናቸው። በጥርጣሬ ላይ የተጣሉ መለያዎችን ለማገድ መብት እንጠብቃለን።",
      icon: FiShield,
    },
    {
      title: "4. ቦርሳ እና መሸለሚያ",
      content:
        "ወደ ቦርሳዎ የሚደረጉ ተቀማጭ ገንዘቦች ተመላሽ አይሆኑም። ድልዎች ከጨዋታ በኋላ ከተረጋገጡ በኋላ ወደ ዋና ቀሪ ሂሳብዎ ይጨመራሉ። ገንዘብ ማውጣት ማረጋገጫ ይፈልጋል እና እስከ 48 ሰዓት ሊወስድ ይችላል።",
      icon: FiLock,
    },
  ];
}
