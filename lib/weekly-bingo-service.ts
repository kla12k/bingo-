import {
  buildWeeklyLobbyExtras,
  buildWeeklyStat,
  getCurrentWeeklyEdition,
  getEditionById,
} from "@/lib/weekly-bingo-db";

export async function getCurrentWeeklyGame(editionId: string | undefined, userId: string | null) {
  const edition = editionId
    ? await getEditionById(editionId)
    : await getCurrentWeeklyEdition();

  if (!edition) {
    return { edition: null, stat: null, ...(await buildWeeklyLobbyExtras()) };
  }

  const stat = await buildWeeklyStat(edition, userId ?? undefined);
  return {
    edition: {
      id: edition.id,
      title: edition.title,
      stake: edition.stake,
      pattern: edition.pattern,
      status: edition.status,
      starts_at: edition.startsAt.toISOString(),
      registration_opens_at: edition.registrationOpensAt.toISOString(),
      registration_closes_at: edition.registrationClosesAt.toISOString(),
    },
    stat,
  };
}