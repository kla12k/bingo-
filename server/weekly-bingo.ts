import type { Server as SocketServer, Socket } from "socket.io";
import { getWeeklyAvailableCardIds, getWeeklyCardNumbers } from "./weekly-card-pool";
import {
  getCustomAuthUserById,
  updateCustomAuthUserWalletBonus,
  incrementCustomAuthUserWalletBonus,
} from "../lib/custom-auth";
import { meetsWinRequirement, shuffleArray, shuffleNumbers, toRowMajorNumbers } from "../lib/bingo";
import { prisma } from "../lib/prisma";
import {
  acquireWeeklyLock,
  releaseWeeklyLock,
  setPendingSelection,
  clearPendingSelection,
  getPendingCardIdsByOthers,
  clearAllPendingForSocket,
  setWeeklyLoopActive,
  isWeeklyLoopActive,
  setWeeklyCalledNumbers,
  getWeeklyCalledNumbers,
} from "../lib/weekly-bingo-state";
import {
  buildWeeklyStat,
  buildWeeklyLobbyExtras,
  botDisplayNameForSlot,
  creditBotWallet,
  decrementBotWallet,
  estimateWinnerPrice,
  findEditionsToStart,
  findOpenEditionsForBots,
  getEditionById,
  getParticipants,
  getParticipantForUser,
  insertParticipant,
  markEditionCancelled,
  markEditionFinished,
  markEditionRunning,
  appendCalledNumbers,
  createNextWeeklyEdition,
  getCurrentWeeklyEdition,
  type WeeklyEditionRow,
  type WeeklyParticipantRow,
} from "../lib/weekly-bingo-db";
import {
  weeklyBotUserId,
  weeklyPlayRoomName,
  weeklyRoomName,
  toPublicWeeklyResult,
  type WeeklyGameStat,
  type WeeklyResultEntryInternal,
} from "../lib/weekly-bingo-types";

const NUMBER_INTERVAL_MS = 4000;
const FIRST_NUMBER_DELAY_MS = 3000;
/** Never join faster than this outside the final hours (looks human). */
const BOT_JOIN_MIN_MS = 90_000;
/** Cap so a quiet night doesn't stall the whole week forever. */
const BOT_JOIN_MAX_MS = 3.5 * 60 * 60_000;
/** Soft finish: leave a buffer before registration closes. */
const BOT_SOFT_END_BUFFER_MS = 45 * 60_000;

const botSchedulers = new Map<string, ReturnType<typeof setTimeout>>();
const activeLoops = new Set<string>();

function botPlayerCode(editionId: string, slot: number): string {
  // Phone-like 9-digit code — stable per slot, not sequential-looking
  let h = 2166136261;
  const key = `${editionId}:${slot}:wbot`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(100_000_000 + (Math.abs(h) % 800_000_000));
}

/** Hour in Africa/Addis_Ababa (UTC+3) for human-like activity curves. */
function addisHour(nowMs: number): number {
  return new Date(nowMs + 3 * 3600_000).getUTCHours();
}

/**
 * Spread bots across the full registration window so joins look like real players:
 * quieter nights, busier evenings, irregular gaps, occasional clusters.
 */
function nextBotJoinDelayMs(edition: WeeklyEditionRow, botsJoined: number): number {
  const now = Date.now();
  const regOpen = edition.registrationOpensAt.getTime();
  const regClose = Math.min(
    edition.registrationClosesAt.getTime(),
    edition.startsAt.getTime()
  );
  const softEnd = Math.max(now + 60_000, regClose - BOT_SOFT_END_BUFFER_MS);
  const remainingBots = Math.max(1, edition.botCount - botsJoined);
  const remainingMs = Math.max(60_000, softEnd - now);

  // Pace so remaining bots finish by softEnd
  let base = remainingMs / remainingBots;

  // Time-of-day: real players are scarce overnight, peak evenings
  const hour = addisHour(now);
  let tod = 1;
  if (hour >= 0 && hour < 6) tod = 3.2;
  else if (hour >= 6 && hour < 9) tod = 1.35;
  else if (hour >= 9 && hour < 12) tod = 1.05;
  else if (hour >= 12 && hour < 17) tod = 0.85;
  else if (hour >= 17 && hour < 22) tod = 0.55;
  else tod = 1.9;

  // Catch up / slow down vs linear expected progress
  const windowStart = Math.min(regOpen, softEnd - 60_000);
  const totalWindow = Math.max(60_000, softEnd - windowStart);
  const elapsed = Math.max(0, now - windowStart);
  const expectedJoined = (elapsed / totalWindow) * edition.botCount;
  const behind = expectedJoined - botsJoined;
  let catchUp = 1;
  if (behind > 8) catchUp = 0.45;
  else if (behind > 3) catchUp = 0.7;
  else if (behind < -8) catchUp = 1.75;
  else if (behind < -3) catchUp = 1.35;

  // Irregular human jitter
  const jitter = 0.4 + Math.random() * 1.8;

  let delay = base * tod * catchUp * jitter;

  // ~10%: short cluster (friend / same household)
  if (Math.random() < 0.1) {
    delay = Math.min(delay, 2 * 60_000 + Math.random() * 6 * 60_000);
  }
  // ~7%: longer quiet gap
  if (Math.random() < 0.07) {
    delay += (8 + Math.random() * 40) * 60_000;
  }

  const hoursLeft = (regClose - now) / 3_600_000;
  // Final stretch: still human-paced (2–12 min), never sub-second
  if (hoursLeft <= 2) {
    return Math.round(
      Math.max(2 * 60_000, Math.min(delay, 12 * 60_000))
    );
  }

  return Math.round(Math.max(BOT_JOIN_MIN_MS, Math.min(BOT_JOIN_MAX_MS, delay)));
}

function participantsAsSelected(participants: WeeklyParticipantRow[]) {
  return participants.map((p) => ({
    user: p.isBot ? weeklyBotUserId(p.editionId, p.botSlot ?? 0) : String(p.userId),
    card: p.cardIds,
    displayName: p.displayName,
    playerCode: p.playerCode ?? undefined,
  }));
}

async function emitWeeklyStat(io: SocketServer, edition: WeeklyEditionRow, userId?: string) {
  const stat = await buildWeeklyStat(edition, userId);
  io.to(weeklyRoomName(edition.id)).emit("weekly_stat", stat);
}

async function broadcastAllLobbyStats(io: SocketServer): Promise<void> {
  const editions = await prisma.weeklyEdition.findMany({
    where: { status: { in: ["open", "locked", "running"] } },
    orderBy: { startsAt: "asc" },
  });
  for (const edition of editions) {
    await emitWeeklyStat(io, edition as WeeklyEditionRow);
  }
}

async function emitAvailableCards(
  socket: Socket,
  editionId: string,
  participants: WeeklyParticipantRow[]
) {
  const selected = participantsAsSelected(participants);
  const pendingOthers = getPendingCardIdsByOthers(editionId, String(socket.data.userId ?? ""));
  const available = await getWeeklyAvailableCardIds(selected);
  const filtered = available.filter((id) => !pendingOthers.has(id));
  socket.emit("weekly_available_cards", { edition_id: editionId, card_ids: filtered.slice(0, 500) });
}

async function refundParticipant(participant: WeeklyParticipantRow, edition: WeeklyEditionRow) {
  if (participant.isBot) {
    await creditBotWallet(edition.id, participant.entryFeePaid);
    return;
  }
  if (!participant.userId) return;
  const user = await getCustomAuthUserById(participant.userId);
  if (!user) return;
  await updateCustomAuthUserWalletBonus(participant.userId, {
    wallet: user.wallet + participant.entryFeePaid,
    bonus: user.bonus,
  });
}

async function addOneBot(edition: WeeklyEditionRow): Promise<boolean> {
  const participants = await getParticipants(edition.id);
  const botCount = participants.filter((p) => p.isBot).length;
  if (botCount >= edition.botCount) return false;

  const cost = edition.stake;
  if (edition.botWalletRemaining < cost) return false;

  const slot = botCount;
  const selected = participantsAsSelected(participants);
  const available = await getWeeklyAvailableCardIds(selected);
  if (available.length === 0) return false;

  const cardId = shuffleArray(available)[0];
  const ok = await decrementBotWallet(edition.id, cost);
  if (!ok) return false;

  const displayName = botDisplayNameForSlot(edition, slot);
  const playerCode = botPlayerCode(edition.id, slot);

  await insertParticipant({
    editionId: edition.id,
    userId: weeklyBotUserId(edition.id, slot),
    isBot: true,
    botSlot: slot,
    displayName,
    playerCode,
    cardIds: [cardId],
    entryFeePaid: cost,
  });

  return true;
}

function scheduleBotJoin(io: SocketServer, edition: WeeklyEditionRow) {
  if (botSchedulers.has(edition.id)) return;

  const tick = async () => {
    try {
      const fresh = await getEditionById(edition.id);
      if (!fresh || fresh.status !== "open") {
        botSchedulers.delete(edition.id);
        return;
      }

      const participants = await getParticipants(edition.id);
      const botsJoined = participants.filter((p) => p.isBot).length;
      if (botsJoined >= fresh.botCount) {
        botSchedulers.delete(edition.id);
        return;
      }

      const now = Date.now();
      if (now < fresh.registrationOpensAt.getTime()) {
        const waitMs = fresh.registrationOpensAt.getTime() - now + 500;
        const t = setTimeout(tick, Math.min(waitMs, 60_000));
        botSchedulers.set(edition.id, t);
        return;
      }
      if (now >= fresh.registrationClosesAt.getTime()) {
        botSchedulers.delete(edition.id);
        return;
      }

      const added = await addOneBot(fresh);
      if (added) {
        const updatedParticipants = await getParticipants(fresh.id);
        const latest = updatedParticipants.filter((p) => p.isBot).pop();
        await emitWeeklyStat(io, fresh);
        if (latest) {
          io.to(weeklyRoomName(fresh.id)).emit("weekly_player_joined", {
            edition_id: fresh.id,
            display_name: latest.displayName,
          });
        }
      }

      const nextBotsJoined = botsJoined + (added ? 1 : 0);
      if (nextBotsJoined >= fresh.botCount) {
        botSchedulers.delete(edition.id);
        return;
      }

      // Failed join (wallet/cards): retry sooner than a full human gap
      const delay = added
        ? nextBotJoinDelayMs(fresh, nextBotsJoined)
        : 5 * 60_000 + Math.random() * 10 * 60_000;
      const t = setTimeout(tick, delay);
      botSchedulers.set(edition.id, t);
    } catch (err) {
      console.error("[weekly-bingo] bot tick error:", err);
      botSchedulers.delete(edition.id);
    }
  };

  // First join: small human-like delay, not instant on boot
  const firstDelay = 45_000 + Math.random() * 180_000;
  const t = setTimeout(tick, firstDelay);
  botSchedulers.set(edition.id, t);
}

async function checkAllCardsForWin(
  edition: WeeklyEditionRow,
  participants: WeeklyParticipantRow[],
  called: number[],
  calledSet: Set<number>
): Promise<WeeklyResultEntryInternal | null> {
  const calledForValidation = [...calledSet];
  if (!calledForValidation.includes(0)) calledForValidation.push(0);

  for (const p of participants) {
    for (const cardId of p.cardIds) {
      const cardRow = await getWeeklyCardNumbers([cardId]);
      const grid = toRowMajorNumbers(cardRow.get(cardId));
      if (grid.length === 0) continue;

      const { met, winningCells } = meetsWinRequirement(
        grid,
        calledForValidation,
        Math.max(1, edition.pattern)
      );
      if (!met || !winningCells) continue;

      const internalUserId = p.isBot
        ? weeklyBotUserId(edition.id, p.botSlot ?? 0)
        : String(p.userId);
      const publicUserId = p.isBot
        ? (p.playerCode ?? botPlayerCode(edition.id, p.botSlot ?? 0))
        : String(p.userId);

      return {
        user_id: publicUserId,
        internal_user_id: internalUserId,
        name: p.displayName,
        card_id: cardId,
        amount_won: 0,
        message: "Bingo",
        winning_numbers: winningCells,
        card: grid,
        is_bot: p.isBot,
      };
    }
  }
  return null;
}

async function resolveWeeklyWinner(
  io: SocketServer,
  edition: WeeklyEditionRow,
  winner: WeeklyResultEntryInternal,
  called: number[]
): Promise<void> {
  const participants = await getParticipants(edition.id);
  const prizePool = participants.reduce((s, p) => s + p.entryFeePaid, 0);
  const winnerPrice = estimateWinnerPrice(prizePool, edition.houseCutPercent);
  winner.amount_won = winnerPrice;

  if (winner.is_bot) {
    await creditBotWallet(edition.id, winnerPrice);
  } else {
    const payoutUserId = winner.internal_user_id ?? winner.user_id;
    await incrementCustomAuthUserWalletBonus(payoutUserId, {
      wallet: winnerPrice,
    });
  }

  await markEditionFinished(edition.id, {
    winnerUserIds: [winner.user_id],
    winnerCardIds: [winner.card_id],
    winnerNames: [winner.name],
    calledNumbers: called,
    winnerSnapshot:
      winner.card && winner.winning_numbers
        ? {
            card: winner.card,
            winning_numbers: winner.winning_numbers,
            called_numbers: called,
          }
        : undefined,
  });

  await prismaUpdateWinnerPrice(edition.id, winnerPrice);

  const publicWinner = toPublicWeeklyResult(winner);
  io.to(weeklyPlayRoomName(edition.id)).emit("weekly_result", {
    edition_id: edition.id,
    data: [publicWinner],
  });
  io.to(weeklyRoomName(edition.id)).emit("weekly_result", {
    edition_id: edition.id,
    data: [publicWinner],
  });

  const stat: WeeklyGameStat = {
    edition_id: edition.id,
    running: false,
    called_numbers: called,
    stake: edition.stake,
    pattern: edition.pattern,
    participant_count: participants.length,
    prize_pool: prizePool,
    winner_price: winnerPrice,
  };
  io.to(weeklyPlayRoomName(edition.id)).emit("weekly_game_stat", stat);

  try {
    const next = await createNextWeeklyEdition(edition);
    if (next) {
      scheduleBotJoin(io, next);
    }
    io.to(weeklyPlayRoomName(edition.id)).emit("weekly_edition_finished", {
      edition_id: edition.id,
      winner: publicWinner,
      next_edition_id: next?.id ?? null,
    });
    io.emit("weekly_edition_finished", {
      edition_id: edition.id,
      winner: publicWinner,
      next_edition_id: next?.id ?? null,
    });
    const extras = await buildWeeklyLobbyExtras();
    io.emit("weekly_lobby_meta", extras);
    if (next) {
      await emitWeeklyStat(io, next);
    }
  } catch (err) {
    console.error("[weekly-bingo] schedule next edition:", err);
  }
}

async function prismaUpdateWinnerPrice(editionId: string, winnerPrice: number) {
  await prisma.weeklyEdition.update({
    where: { id: editionId },
    data: { winnerPrice },
  });
}

async function runWeeklyNumberLoop(io: SocketServer, editionId: string): Promise<void> {
  if (activeLoops.has(editionId)) return;
  if (await isWeeklyLoopActive(editionId)) return;

  activeLoops.add(editionId);
  await setWeeklyLoopActive(editionId, true);

  try {
    const edition = await getEditionById(editionId);
    if (!edition || edition.status !== "running") return;

    const randomNumbers = Array.isArray(edition.randomNumbers)
      ? (edition.randomNumbers as number[])
      : shuffleNumbers();

    const called: number[] = [];
    const calledSet = new Set<number>([0]);

    await new Promise((r) => setTimeout(r, FIRST_NUMBER_DELAY_MS));

    for (const num of randomNumbers) {
      if (calledSet.has(num)) continue;

      const fresh = await getEditionById(editionId);
      if (!fresh || fresh.status !== "running") break;

      called.push(num);
      calledSet.add(num);
      await setWeeklyCalledNumbers(editionId, called);
      await appendCalledNumbers(editionId, called);

      io.to(weeklyPlayRoomName(editionId)).emit("weekly_random_number", {
        edition_id: editionId,
        random_number: num,
        called_numbers: called,
      });

      const participants = await getParticipants(editionId);
      const winner = await checkAllCardsForWin(fresh, participants, called, calledSet);
      if (winner) {
        await resolveWeeklyWinner(io, fresh, winner, called);
        break;
      }

      await new Promise((r) => setTimeout(r, NUMBER_INTERVAL_MS));
    }

    const finalEdition = await getEditionById(editionId);
    if (finalEdition && finalEdition.status === "running") {
      await markEditionFinished(editionId, {
        winnerUserIds: [],
        winnerCardIds: [],
        winnerNames: [],
        calledNumbers: await getWeeklyCalledNumbers(editionId),
      });
      io.to(weeklyPlayRoomName(editionId)).emit("weekly_game_closed", {
        edition_id: editionId,
        no_winner: true,
      });
    }
  } catch (err) {
    console.error("[weekly-bingo] number loop error:", err);
  } finally {
    activeLoops.delete(editionId);
    await setWeeklyLoopActive(editionId, false);
  }
}

async function startWeeklyEdition(io: SocketServer, edition: WeeklyEditionRow): Promise<void> {
  const lock = await acquireWeeklyLock(edition.id);
  if (!lock) return;

  try {
    const fresh = await getEditionById(edition.id);
    if (!fresh || !["open", "locked"].includes(fresh.status)) return;
    if (fresh.startsAt.getTime() > Date.now()) return;

    const participants = await getParticipants(fresh.id);
    const totalCards = participants.reduce((s, p) => s + p.cardIds.length, 0);
    if (totalCards < 2) {
      for (const p of participants) await refundParticipant(p, fresh);
      await markEditionCancelled(fresh.id);
      io.to(weeklyRoomName(fresh.id)).emit("weekly_cancelled", {
        edition_id: fresh.id,
        reason: "insufficient_players",
      });
      return;
    }

    const prizePool = participants.reduce((s, p) => s + p.entryFeePaid, 0);
    const winnerPrice = estimateWinnerPrice(prizePool, fresh.houseCutPercent);
    const randomNumbers = shuffleNumbers();

    const playerMeta: Record<string, { displayName: string; playerCode: string }> = {};
    for (const p of participants) {
      const uid = p.isBot
        ? weeklyBotUserId(fresh.id, p.botSlot ?? 0)
        : String(p.userId);
      playerMeta[uid] = {
        displayName: p.displayName,
        playerCode: p.playerCode ?? botPlayerCode(fresh.id, p.botSlot ?? 0),
      };
    }

    await markEditionRunning(fresh.id, {
      prizePool,
      winnerPrice,
      randomNumbers,
      playerMeta,
    });

    io.to(weeklyRoomName(fresh.id)).emit("weekly_game_started", {
      edition_id: fresh.id,
      stake: fresh.stake,
      pattern: fresh.pattern,
      starts_at: fresh.startsAt.toISOString(),
    });
    io.to(weeklyPlayRoomName(fresh.id)).emit("weekly_game_started", {
      edition_id: fresh.id,
      stake: fresh.stake,
      pattern: fresh.pattern,
    });

    const gameStat: WeeklyGameStat = {
      edition_id: fresh.id,
      running: true,
      called_numbers: [],
      stake: fresh.stake,
      pattern: fresh.pattern,
      participant_count: participants.length,
      prize_pool: prizePool,
      winner_price: winnerPrice,
    };
    io.to(weeklyPlayRoomName(fresh.id)).emit("weekly_game_stat", gameStat);

    await emitWeeklyStat(io, fresh);

    void runWeeklyNumberLoop(io, fresh.id);
  } finally {
    await releaseWeeklyLock(edition.id, lock);
  }
}

export function registerWeeklyBingoHandlers(io: SocketServer): void {
  io.on("connection", (socket) => {
    socket.on("join_weekly_lobby", async (payload?: { edition_id?: string }) => {
      try {
        let edition: WeeklyEditionRow | null = null;
        if (payload?.edition_id) {
          edition = await getEditionById(String(payload.edition_id));
        } else {
          edition = await getCurrentWeeklyEdition();
        }
        if (!edition) {
          const extras = await buildWeeklyLobbyExtras();
          socket.emit("weekly_no_edition", { ...extras });
          return;
        }

        for (const room of socket.rooms) {
          if (room.startsWith("weekly:") && !room.startsWith("weekly_play:")) {
            socket.leave(room);
          }
        }

        socket.join(weeklyRoomName(edition.id));
        const userId = socket.data.userId as string | undefined;
        const extras = await buildWeeklyLobbyExtras();
        socket.emit("weekly_lobby_meta", extras);
        await emitWeeklyStat(io, edition, userId);
        const participants = await getParticipants(edition.id);
        await emitAvailableCards(socket, edition.id, participants);
      } catch (err) {
        console.error("[weekly-bingo] join_weekly_lobby:", err);
        socket.emit("error", { message: "Could not join weekly lobby" });
      }
    });

    socket.on("join_weekly_play", async (payload: { edition_id: string }) => {
      try {
        const editionId = String(payload?.edition_id ?? "");
        const edition = await getEditionById(editionId);
        if (!edition) {
          socket.emit("weekly_play_unavailable", {
            edition_id: editionId,
            reason: "not_found",
          });
          return;
        }
        if (edition.status !== "running") {
          socket.emit("weekly_play_unavailable", {
            edition_id: editionId,
            reason: edition.status,
          });
          return;
        }
        socket.join(weeklyPlayRoomName(editionId));

        const userId = socket.data.userId as string | undefined;
        const mine = userId ? await getParticipantForUser(editionId, userId) : null;

        if (mine && mine.cardIds.length > 0) {
          const cards = await getWeeklyCardNumbers(mine.cardIds);
          const payload = mine.cardIds.map((cardId) => ({
            card_id: cardId,
            numbers: toRowMajorNumbers(cards.get(cardId)),
          }));
          socket.emit("weekly_my_cards", {
            edition_id: editionId,
            cards: payload,
          });
          // Keep legacy single-card event for older clients
          socket.emit("weekly_my_card", {
            edition_id: editionId,
            card_id: payload[0].card_id,
            numbers: payload[0].numbers,
          });
        }

        const called = edition.calledNumbers?.length
          ? edition.calledNumbers
          : await getWeeklyCalledNumbers(editionId);

        socket.emit("weekly_game_stat", {
          edition_id: editionId,
          running: edition.status === "running",
          called_numbers: called,
          stake: edition.stake,
          pattern: edition.pattern,
          participant_count: (await getParticipants(editionId)).length,
          prize_pool: edition.prizePool,
          winner_price: edition.winnerPrice,
        } satisfies WeeklyGameStat);
      } catch (err) {
        console.error("[weekly-bingo] join_weekly_play:", err);
      }
    });

    socket.on("weekly_pending_selection", async (payload: { edition_id: string; card_ids: number[] }) => {
      const userId = socket.data.userId as string;
      const editionId = String(payload?.edition_id ?? "");
      const cardIds = Array.isArray(payload?.card_ids)
        ? payload.card_ids.map(Number).filter((n) => n > 0)
        : [];
      setPendingSelection(editionId, socket.id, userId, cardIds);
      const participants = await getParticipants(editionId);
      await emitAvailableCards(socket, editionId, participants);
    });

    socket.on("weekly_confirm_entry", async (payload: { edition_id: string; card_ids: number[] }) => {
      const userId = socket.data.userId as string;
      const editionId = String(payload?.edition_id ?? "");
      const cardIds = Array.isArray(payload?.card_ids)
        ? [...new Set(payload.card_ids.map(Number).filter((n) => n > 0))]
        : [];

      if (cardIds.length === 0) {
        socket.emit("error", { message: "Select a card first" });
        return;
      }

      const lock = await acquireWeeklyLock(editionId);
      if (!lock) {
        socket.emit("error", { message: "Please try again" });
        return;
      }

      try {
        const edition = await getEditionById(editionId);
        if (!edition || edition.status !== "open") {
          socket.emit("error", { message: "Registration is closed" });
          return;
        }

        const now = new Date();
        if (now < edition.registrationOpensAt || now > edition.registrationClosesAt) {
          socket.emit("error", { message: "Registration is not open" });
          return;
        }

        const existing = await getParticipantForUser(editionId, userId);
        if (existing) {
          socket.emit("error", { message: "You already joined this weekly game" });
          return;
        }

        if (cardIds.length > edition.maxCardsPerUser) {
          socket.emit("error", { message: `Max ${edition.maxCardsPerUser} card(s) allowed` });
          return;
        }

        const participants = await getParticipants(editionId);
        const taken = new Set(participants.flatMap((p) => p.cardIds));
        const pendingOthers = getPendingCardIdsByOthers(editionId, userId);
        for (const id of cardIds) {
          if (taken.has(id) || pendingOthers.has(id)) {
            socket.emit("error", { message: "Card already taken" });
            return;
          }
        }

        const user = await getCustomAuthUserById(userId);
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        const cost = edition.stake * cardIds.length;
        const totalBalance = user.wallet + user.bonus;
        if (totalBalance < cost) {
          socket.emit("error", { message: "Insufficient balance" });
          return;
        }

        let remain = cost;
        let wallet = user.wallet;
        let bonus = user.bonus;
        if (wallet >= remain) {
          wallet -= remain;
          remain = 0;
        } else {
          remain -= wallet;
          wallet = 0;
        }
        if (remain > 0) bonus -= remain;

        await updateCustomAuthUserWalletBonus(userId, { wallet, bonus });

        await insertParticipant({
          editionId,
          userId,
          isBot: false,
          displayName: user.name || "Player",
          playerCode: user.phone_number || userId.slice(0, 8),
          cardIds,
          entryFeePaid: cost,
        });

        clearPendingSelection(editionId, socket.id);

        socket.emit("weekly_entry_confirmed", {
          edition_id: editionId,
          card_ids: cardIds,
          entry_fee_paid: cost,
        });

        const updated = await getEditionById(editionId);
        if (updated) {
          await emitWeeklyStat(io, updated, userId);
          io.to(weeklyRoomName(editionId)).emit("weekly_player_joined", {
            edition_id: editionId,
            display_name: user.name || "Player",
          });
        }
      } catch (err) {
        console.error("[weekly-bingo] confirm:", err);
        socket.emit("error", { message: "Could not confirm entry" });
      } finally {
        await releaseWeeklyLock(editionId, lock);
      }
    });

    socket.on("disconnect", () => {
      clearAllPendingForSocket(socket.id);
    });
  });
}

export function startWeeklyBingoCron(io: SocketServer): void {
  setInterval(async () => {
    try {
      const openEditions = await findOpenEditionsForBots();
      for (const edition of openEditions) {
        scheduleBotJoin(io, edition);
      }

      const toStart = await findEditionsToStart();
      for (const edition of toStart) {
        await startWeeklyEdition(io, edition);
      }

      const running = await getCurrentWeeklyEdition();
      if (running?.status === "running" && !(await isWeeklyLoopActive(running.id))) {
        void runWeeklyNumberLoop(io, running.id);
      }

      await broadcastAllLobbyStats(io);
    } catch (err) {
      console.error("[weekly-bingo] cron:", err);
    }
  }, 5_000);

  console.log("[weekly-bingo] cron started (5s interval)");
}

export async function initWeeklyBingoOnBoot(io: SocketServer): Promise<void> {
  try {
    const openEditions = await findOpenEditionsForBots();
    for (const edition of openEditions) {
      scheduleBotJoin(io, edition);
    }
  } catch (err) {
    console.error("[weekly-bingo] boot init:", err);
  }
}
