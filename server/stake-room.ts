import type { Socket } from "socket.io";
import type { Server as SocketServer } from "socket.io";
import { prisma, withDbRetry } from "../lib/prisma";
import { getNumberCallingIntervalMs, getGameStartCountdownSec, getBotWinPercent } from "../lib/game-config";
import {
  getSelectedPlayers,
  setSelectedPlayers,
  getPlayerCount,
  setPlayerCount,
  getCurrentGameId,
  setCurrentGameId,
  getNextGameStart,
  setNextGameStart,
  setStakeStartHold,
  getStakeStartHoldRemainingMs,
  getGameState,
  setGameState,
  clearGameState,
  acquireStakeLock,
  releaseStakeLock,
  acquirePrepareLock,
  releasePrepareLock,
  tryClaim,
  releaseClaim,
  type SelectedPlayer,
} from "../lib/stake-state";
import { isValidStake, getBonusForStake, getBonesMinPlayers, getBonusAmount, getStakeAmounts } from "../lib/stake-config";
import {
  getCustomAuthUserById,
  updateCustomAuthUserWalletBonus,
  incrementCustomAuthUserWalletBonus,
  updateCustomAuthUserConsecutiveLosses,
  resetCustomAuthUserConsecutiveLosses,
  getUserGameStats,
} from "../lib/custom-auth";
import { getAvailableCardIds, getCardNumbers } from "./card-pool";
import { recordJackpotWin } from "../lib/jackpot-win-log";
import { shuffleNumbers, shuffleArray, hasBingo, getBonesMultiplier, toRowMajorNumbers } from "../lib/bingo";
import { ensureCardPool } from "./card-pool";
import { getActiveGamesByStake } from "../lib/active-games";
import { publishToQueue, QUEUES } from "../lib/rabbitmq";
import {
  upsertHumanParticipations,
  upsertBotParticipations,
} from "../lib/game-participation";
import {
  BOT_USER_PREFIX,
  ensureBotIdentity,
  buildPlayerMetaFromSelected,
  botNameFromMeta,
  botDisplayName,
  botPlayerCode,
} from "../lib/bot-player";
import { settleGameRefundOnce } from "./game-settlement";
import { rollBotTargetCardCount, getBotScheduleSlot, refreshBotScheduleCache, refreshBotScheduleCacheForStake } from "../lib/bot-schedule";
import {
  debitBotWalletInTx,
  creditBotWalletInTx,
  recordChargeInTx,
  writeLedgerInTx,
} from "../lib/balance";

const COUNTDOWN_SEC = 30;
const DEFAULT_BOT_CARDS = 5; // used when RandomPlayer.number_of_players is missing or 0
/** Delay between bot joins when a human picks a card (looks like others reacting). */
const BOT_JOIN_DELAY_MS_MIN = 1200;
const BOT_JOIN_DELAY_MS_VARIANCE = 1600;
/** Stop adding bots this many ms before countdown hits 0. */
const BOT_JOIN_STOP_BEFORE_END_MS = 3500;
/** Random pause before the first bot joins a new round. */
const BOT_FIRST_JOIN_DELAY_MIN_MS = 3000;
const BOT_FIRST_JOIN_DELAY_MAX_MS = 9000;
const NUMBER_INTERVAL_MS = 4000;
const FIRST_NUMBER_DELAY_MS = 3000;
const INITIAL_DELAY_MS = 2000;
const BINGO_CLAIM_COOLDOWN_MS = 2000; // min ms between bingo claims per user per game (anti-spam)
/** Collect simultaneous human bingo claims before paying out (split pot evenly). */
const BINGO_CLAIM_WINDOW_MS = 2500;
/** Forced wins prefer this call window. If a human would bingo first, we stretch later rather than play fair. */
const RIGGED_WIN_CALL_MIN = 12;
const RIGGED_WIN_CALL_MAX = 18;
const RIGGED_WIN_CALL_FALLBACK_MAX = 24;
/** If no numbers were called yet, wait this long before assuming the in-memory loop died (restart/crash). */
const GRACE_MS_BEFORE_RESUME_EMPTY_CALLS = INITIAL_DELAY_MS + FIRST_NUMBER_DELAY_MS + 8000;
/** Don't orphan-fail a game while prepare/openGameForPlay is still starting. */
const PREPARE_GRACE_MS = 20_000;

/** In-memory only — lost on process restart; used to avoid duplicate loops + to resume orphans. */
const activeNumberLoops = new Set<string>();
const prepareGameTimers = new Map<number, ReturnType<typeof setTimeout>>();
const prepareGameInFlight = new Map<number, Promise<void>>();
const countdownSyncIntervals = new Map<number, ReturnType<typeof setInterval>>();
const botJoinAbort = new Map<number, { cancelled: boolean }>();
/** Per-stake bot card target for the current lobby round (stable until next countdown). */
const botRoundTargetByStake = new Map<number, number>();

type BingoWinnerEntry = {
  user_id: string;
  card_id: number;
  numbers: number[][];
  winning_numbers?: number[];
  displayName?: string;
};

type BingoGameSnapshot = {
  winnerPrice: number;
  stake: number;
  playerCard: Record<string, number[]>;
  adminCut: number;
  jackpotAwarded: number;
};

const bingoClaimTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const bingoClaimChains = new Map<string, Promise<void>>();
const BINGO_PAYOUT_LOCK_MS = 60_000;

async function withRedisLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const token = await tryClaim(key, ttlMs);
    if (token) {
      try {
        return await fn();
      } finally {
        await releaseClaim(key, token);
      }
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`lock timeout: ${key}`);
}

/** True while the 2.5s simultaneous-winner window is open (memory or Redis). */
async function isGameInClaimWindow(gameId: string): Promise<boolean> {
  if (bingoClaimTimeouts.has(gameId)) return true;
  return (await getGameState(gameId, "bingo_claim_open")) === true;
}

async function loadClaimWinners(gameId: string): Promise<BingoWinnerEntry[]> {
  const raw = (await getGameState(gameId, "bingo_claim_winners")) as BingoWinnerEntry[] | null;
  return Array.isArray(raw) ? raw : [];
}

async function completeGameAfterBingoResolution(
  io: SocketServer,
  stake: number,
  gameId: string
): Promise<void> {
  await setGameState(gameId, "is_running", false);
  await setCurrentGameId(stake, null);
  await tryStartGame(io, stake);
}

function enqueueBingoClaim(gameId: string, task: () => Promise<void>): Promise<void> {
  const tail = bingoClaimChains.get(gameId) ?? Promise.resolve();
  const next = tail.then(task).catch((err) => {
    console.error("[bingo] claim chain error:", err);
  });
  bingoClaimChains.set(gameId, next);
  return next;
}

function withFreeSpaceCalled(called: number[]): number[] {
  const set = new Set<number>();
  for (const n of called) {
    const num = Number(n);
    if (!Number.isNaN(num) && num >= 0 && num <= 75) set.add(num);
  }
  set.add(0);
  return Array.from(set);
}

async function persistClaimWinner(
  io: SocketServer,
  stake: number,
  gameId: string,
  calledForValidation: number[],
  winner: BingoWinnerEntry,
  gameSnapshot: BingoGameSnapshot
): Promise<{ added: boolean; winnersCount: number; alreadyResolved: boolean }> {
  return withRedisLock(`bingo:claim:${gameId}`, 5000, async () => {
    const bingoResolved = await getGameState(gameId, "bingo");
    const finalizing = await getGameState(gameId, "bingo_claim_finalizing");
    if (bingoResolved || finalizing) {
      return { added: false, winnersCount: 0, alreadyResolved: true };
    }

    const alreadyOpen = (await getGameState(gameId, "bingo_claim_open")) === true;
    const calledWithFree = withFreeSpaceCalled(calledForValidation);
    if (!alreadyOpen) {
      await setGameState(gameId, "bingo_claim_called", calledWithFree);
      await setGameState(gameId, "bingo_claim_snapshot", gameSnapshot);
      await setGameState(gameId, "bingo_claim_winners", []);
      await setGameState(gameId, "bingo_claim_deadline", Date.now() + BINGO_CLAIM_WINDOW_MS);
      await setGameState(gameId, "bingo_claim_stake", stake);
      await setGameState(gameId, "bingo_claim_open", true);
      await setGameState(gameId, "is_running", false);
      const prevTimeout = bingoClaimTimeouts.get(gameId);
      if (prevTimeout) clearTimeout(prevTimeout);
      const timeout = setTimeout(() => {
        void finalizeBingoClaimSession(io, gameId);
      }, BINGO_CLAIM_WINDOW_MS);
      bingoClaimTimeouts.set(gameId, timeout);
      console.log(
        `[BINGO] claim window OPEN for game ${gameId} (${BINGO_CLAIM_WINDOW_MS}ms, board frozen)`
      );
    }

    const frozenCalled =
      ((await getGameState(gameId, "bingo_claim_called")) as number[] | null) ?? calledWithFree;
    if (!winner.numbers?.length || !hasBingo(winner.numbers, frozenCalled)) {
      const winners = await loadClaimWinners(gameId);
      return { added: false, winnersCount: winners.length, alreadyResolved: false };
    }

    const winners = await loadClaimWinners(gameId);
    if (winners.some((w) => String(w.user_id) === String(winner.user_id))) {
      return { added: false, winnersCount: winners.length, alreadyResolved: false };
    }
    winners.push(winner);
    await setGameState(gameId, "bingo_claim_winners", winners);
    return { added: true, winnersCount: winners.length, alreadyResolved: false };
  });
}

async function revalidateClaimWinners(
  gameId: string,
  claimed: BingoWinnerEntry[],
  called: number[],
  playerCard: Record<string, number[]>
): Promise<BingoWinnerEntry[]> {
  const valid: BingoWinnerEntry[] = [];
  const seenUsers = new Set<string>();

  for (const w of claimed) {
    const uid = String(w.user_id ?? "");
    if (!uid || seenUsers.has(uid)) continue;
    const owned = Array.isArray(playerCard[uid]) ? playerCard[uid].map(Number) : [];
    const cid = Number(w.card_id);
    if (!owned.includes(cid)) {
      console.warn(`[BINGO] drop winner ${uid}:${cid} — card not owned in game ${gameId}`);
      continue;
    }
    const cardRow = await prisma.gameCard.findUnique({
      where: { id: BigInt(cid) },
      select: { numbers: true },
    });
    if (!cardRow?.numbers) continue;
    const nums = toRowMajorNumbers(cardRow.numbers);
    if (nums.length !== 5) continue;
    const winning = hasBingo(nums, withFreeSpaceCalled(called));
    if (!winning) {
      console.warn(`[BINGO] drop winner ${uid}:${cid} — no bingo on frozen board for game ${gameId}`);
      continue;
    }
    seenUsers.add(uid);
    valid.push({
      ...w,
      user_id: uid,
      card_id: cid,
      numbers: nums,
      winning_numbers: winning,
    });
  }
  return valid;
}

async function maybeFinalizeExpiredClaim(io: SocketServer, gameId: string): Promise<void> {
  const open = (await getGameState(gameId, "bingo_claim_open")) === true;
  if (!open) return;
  const deadline = (await getGameState(gameId, "bingo_claim_deadline")) as number | null;
  if (typeof deadline === "number" && Date.now() >= deadline) {
    await finalizeBingoClaimSession(io, gameId);
  }
}

async function finalizeBingoClaimSession(io: SocketServer, gameId: string): Promise<void> {
  const localTimeout = bingoClaimTimeouts.get(gameId);
  if (localTimeout) clearTimeout(localTimeout);
  bingoClaimTimeouts.delete(gameId);
  await setGameState(gameId, "bingo_claim_open", false);

  const stakeRaw = await getGameState(gameId, "bingo_claim_stake");
  const stake = Number(stakeRaw ?? 0);

  const payoutToken = await tryClaim(`bingo:payout:${gameId}`, BINGO_PAYOUT_LOCK_MS);
  if (!payoutToken) {
    console.log(`[BINGO] payout already in progress or done for game ${gameId}`);
    return;
  }

  let claimed: BingoWinnerEntry[] = [];
  let called: number[] = [];
  let snapshot: BingoGameSnapshot | null = null;
  let resolvedStake = stake;

  try {
    const lockData = await withRedisLock(`bingo:claim:${gameId}`, 5000, async () => {
      await setGameState(gameId, "bingo_claim_finalizing", true);
      await setGameState(gameId, "bingo_claim_open", false);
      const claimedWinners = await loadClaimWinners(gameId);
      const calledNumbers = ((await getGameState(gameId, "bingo_claim_called")) as number[] | null) ?? [];
      const gameSnapshot = (await getGameState(gameId, "bingo_claim_snapshot")) as BingoGameSnapshot | null;
      const resStake = stake || Number(gameSnapshot?.stake ?? 0);
      return { claimed: claimedWinners, called: calledNumbers, snapshot: gameSnapshot, resolvedStake: resStake };
    });
    claimed = lockData.claimed;
    called = lockData.called;
    snapshot = lockData.snapshot;
    resolvedStake = lockData.resolvedStake;
  } catch (err) {
    await releaseClaim(`bingo:payout:${gameId}`, payoutToken);
    throw err;
  }

  const bingoAlready = await getGameState(gameId, "bingo");
  if (bingoAlready) {
    const resultPayload = (await getGameState(gameId, "result_payload")) as Array<{
      user_id: string;
      name: string;
      card_id: number;
      amount_won: number;
      message: string;
    }> | null;
    if (stake && Array.isArray(resultPayload) && resultPayload.length > 0) {
      io.to(roomName(stake)).emit("result", { data: resultPayload, game_id: gameId });
    }
    if (stake) await completeGameAfterBingoResolution(io, stake, gameId);
    return;
  }

  if (!snapshot || claimed.length === 0 || resolvedStake <= 0) {
    console.warn(`[BINGO] finalize aborted for ${gameId}: missing snapshot/winners`);
    await releaseClaim(`bingo:payout:${gameId}`, payoutToken);
    return;
  }

  const winners = await revalidateClaimWinners(gameId, claimed, called, snapshot.playerCard);
  if (winners.length === 0) {
    console.warn(`[BINGO] finalize aborted for ${gameId}: no valid winners after re-check`);
    await releaseClaim(`bingo:payout:${gameId}`, payoutToken);
    return;
  }

  console.log(
    `[BINGO] Finalizing claim window for game ${gameId} with ${winners.length} winner(s)`,
    winners.map((w) => `${w.user_id}:${w.card_id}`)
  );

  try {
    const resultPayload = await resolveBingo(io, resolvedStake, gameId, called, winners, {
      winnerPrice: snapshot.winnerPrice,
      stake: snapshot.stake,
      playerCard: snapshot.playerCard,
      adminCut: snapshot.adminCut,
      jackpotAwarded: snapshot.jackpotAwarded,
    });
    const acceptedKeys = winners.map((w) => `${w.user_id}:${w.card_id}`);
    await setGameState(gameId, "accepted_claims", acceptedKeys);
    await setGameState(gameId, "result_payload", resultPayload);
    await completeGameAfterBingoResolution(io, resolvedStake, gameId);
  } catch (err) {
    console.error(`[BINGO] finalize failed for game ${gameId}:`, err);
    const gameRow = await prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, winner: true },
    });
    if (gameRow?.status === "closed") {
      console.warn(`[BINGO] game ${gameId} already closed after finalize error — skipping fail`);
      await completeGameAfterBingoResolution(io, resolvedStake, gameId).catch(() => { });
      return;
    }
    const bingoFlag = await getGameState(gameId, "bingo");
    if (bingoFlag || (Array.isArray(gameRow?.winner) && gameRow.winner.length > 0)) {
      console.warn(`[BINGO] game ${gameId} already paid — skipping refund-on-error`);
      return;
    }
    await releaseClaim(`bingo:payout:${gameId}`, payoutToken);
    await failGameAndClearStake(resolvedStake, gameId);
  }
}

/** Bot bingo enters the same claim window as humans so split payouts persist correctly. */
async function handleBotBingoClaim(
  io: SocketServer,
  stake: number,
  gameId: string,
  called: number[],
  botResult: {
    winner: {
      user_id: string;
      card_id: number;
      numbers: number[][];
      winning_numbers?: number[];
      displayName?: string;
    };
    game: {
      winnerPrice: number;
      playerCard: Record<string, number[]>;
      jackpotAwarded: number;
      adminCut: number;
    };
  }
): Promise<void> {
  const bingo = await getGameState(gameId, "bingo");
  if (bingo) return;

  const { added, winnersCount } = await persistClaimWinner(
    io,
    stake,
    gameId,
    called,
    botResult.winner,
    {
      winnerPrice: botResult.game.winnerPrice,
      stake,
      playerCard: botResult.game.playerCard,
      adminCut: botResult.game.adminCut,
      jackpotAwarded: botResult.game.jackpotAwarded,
    }
  );
  if (added) {
    const winners = await loadClaimWinners(gameId);
    io.to(roomName(stake)).emit("bingo_claimed", {
      game_id: gameId,
      winners_count: winnersCount,
      winners: winners.map((w) => ({ user_id: w.user_id, card_id: w.card_id })),
    });
  }
}

function parseRandomNumbersJson(raw: unknown): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is number => typeof x === "number");
  }
  return [];
}

function pickBestCalled(redis: unknown, db: number[]): number[] {
  const r = Array.isArray(redis) ? redis.filter((x): x is number => typeof x === "number") : [];
  if (db.length >= r.length) return db;
  return r;
}

/**
 * If Redis/DB say a game is playing but this process lost `runNumberLoop` (restart/crash),
 * resume drawing from DB `randomNumbers` + existing `calledNumbers`.
 */
async function resumeNumberLoopIfNeeded(io: SocketServer, stake: number): Promise<void> {
  const reconciled = await reconcileStaleStakeGameState(stake);
  if (reconciled) return;

  const gameId = await getCurrentGameId(stake);
  if (!gameId) return;
  if (activeNumberLoops.has(gameId)) return;
  if (await isGameInClaimWindow(gameId)) return;

  const isRunning = await getGameState(gameId, "is_running");
  if (!isRunning) return;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, randomNumbers: true, calledNumbers: true, startedAt: true },
  });
  if (!game || game.status !== "playing") return;

  const randomNumbers = parseRandomNumbersJson(game.randomNumbers);
  if (randomNumbers.length === 0) return;

  const redisCalled = await getGameState(gameId, "called_numbers");
  const dbCalled = Array.isArray(game.calledNumbers) ? game.calledNumbers : [];
  const called = pickBestCalled(redisCalled, dbCalled);

  const startedAt = game.startedAt ? new Date(game.startedAt).getTime() : 0;
  const ageMs = Date.now() - startedAt;
  if (called.length === 0 && ageMs < GRACE_MS_BEFORE_RESUME_EMPTY_CALLS) {
    return;
  }

  void runNumberLoop(io, stake, gameId, randomNumbers, called, { resume: true });
}

/** Call on socket server startup so games orphaned by a restart resume calling numbers. */
export async function resumeOrphanedNumberLoopsForAllStakes(io: SocketServer): Promise<void> {
  try {
    const stakes = await getStakeAmounts();
    for (const stake of stakes) {
      await resumeNumberLoopIfNeeded(io, stake);
    }
  } catch (e) {
    console.error("[resumeOrphanedNumberLoopsForAllStakes]", e);
  }
}

function calculateWinnerPrice(stake: number, totalCards: number): number {
  let winnerPrice = stake * totalCards;
  if (winnerPrice >= 100) {
    winnerPrice -= winnerPrice * 0.2;
  } else if (winnerPrice >= 50) {
    winnerPrice -= winnerPrice * 0.1;
  }
  return Math.round(winnerPrice * 100) / 100;
}

function splitAdminCutByCards(
  humanCards: number,
  botCards: number,
  adminCut: number
): { humanAdminCut: number; botAdminCut: number } {
  const total = humanCards + botCards;
  if (total <= 0 || adminCut <= 0) return { humanAdminCut: 0, botAdminCut: 0 };
  const humanAdminCut = Math.round((adminCut * (humanCards / total)) * 100) / 100;
  const botAdminCut = Math.round((adminCut - humanAdminCut) * 100) / 100;
  return { humanAdminCut, botAdminCut };
}

function countCardsByType(playerCard: Record<string, number[]>): { humanCards: number; botCards: number } {
  let humanCards = 0;
  let botCards = 0;
  for (const [uid, cards] of Object.entries(playerCard)) {
    const n = Array.isArray(cards) ? cards.length : 0;
    if (uid.startsWith(BOT_USER_PREFIX)) botCards += n;
    else humanCards += n;
  }
  return { humanCards, botCards };
}

/** Finite rounded money value; avoids NaN/Infinity in DB writes. */
function safeMoney(n: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * Update stake-room money fields after prepareGameAndDeduct.
 * Uses a text SQL literal for numeric columns so PostgreSQL accepts values even when
 * physical columns are INTEGER or DOUBLE PRECISION (Prisma's binary float8 bind can
 * throw 22P03 "incorrect binary data format" if types don't match exactly).
 */
/**
 * Persists per-game money after stakes are collected.
 * - `jackpot_deducted_from_admin_cut` = 2% of gross admin cut (feeds the stake jackpot pool; audit trail).
 * - `adminCut` = gross admin cut minus that 2% (net admin for this game).
 */
async function updateGameFinancialsAfterPrepare(
  gameId: string,
  winnerPrice: number,
  adminCutAfterJackpot: number,
  jackpotDeductedFromGrossAdminCut: number,
  jackpotAwarded: number,
  humanCardCount: number,
  botCardCount: number
): Promise<void> {
  const wp = safeMoney(winnerPrice);
  const ac = safeMoney(adminCutAfterJackpot);
  const jd = safeMoney(jackpotDeductedFromGrossAdminCut);
  const ja = safeMoney(jackpotAwarded);
  const { humanAdminCut, botAdminCut } = splitAdminCutByCards(humanCardCount, botCardCount, ac);
  const hac = safeMoney(humanAdminCut);
  const bac = safeMoney(botAdminCut);
  await prisma.$executeRawUnsafe(
    `UPDATE "game" SET "winnerPrice" = ${wp}, "adminCut" = ${ac}, "jackpot_deducted_from_admin_cut" = ${jd}, "jackpot_awarded" = ${ja}, "human_admin_cut" = ${hac}, "bot_admin_cut" = ${bac}, "human_card_count" = ${humanCardCount}, "bot_card_count" = ${botCardCount} WHERE "id" = $1`,
    gameId
  );
}

function roomName(stake: number): string {
  return `stake:${stake}`;
}

const STAKE_LOBBY_ROOM = "stake_lobby";

// Card preview cache: cardId -> { numbers, expiresAt }
const CARD_PREVIEW_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const cardPreviewCache = new Map<number, { numbers: number[][]; expiresAt: number }>();

function getCachedCardPreview(cardId: number): number[][] | null {
  const entry = cardPreviewCache.get(cardId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.numbers;
}

function setCachedCardPreview(cardId: number, numbers: number[][]): void {
  cardPreviewCache.set(cardId, {
    numbers,
    expiresAt: Date.now() + CARD_PREVIEW_CACHE_TTL_MS,
  });
}

// socketId -> { stake, cardIds }
const pendingSelections = new Map<string, { stake: number; cardIds: number[] }>();
// TTL: release pending selection after 2 minutes if user doesn't confirm
const PENDING_SELECTION_TTL_MS = 2 * 60 * 1000;
const pendingSelectionTimeouts = new Map<string, NodeJS.Timeout>();

// Per-stake mutex: serialise confirm_cards so two simultaneous requests
// can never both pass the "is card taken?" check before either commits.
async function withStakeLock<T>(stake: number, fn: () => Promise<T>): Promise<T> {
  const token = await acquireStakeLock(stake);
  if (!token) {
    throw new Error("Could not acquire lock for stake room (timeout)");
  }
  try {
    return await fn();
  } finally {
    await releaseStakeLock(stake, token);
  }
}

/** Serialises countdown scheduling + prepareGameAndDeduct across processes. */
async function withPrepareLock<T>(
  stake: number,
  fn: () => Promise<T>,
  options?: { onTimeout?: () => T }
): Promise<T | undefined> {
  const token = await acquirePrepareLock(stake);
  if (!token) {
    if (options?.onTimeout) return options.onTimeout();
    console.warn(`[prepare-lock] timeout stake=${stake}`);
    return undefined;
  }
  try {
    return await fn();
  } finally {
    await releasePrepareLock(stake, token);
  }
}

/** Total cost user has committed across all stakes (pending games not yet started). Used to prevent negative balance when playing multiple games. */
async function getPendingCostForUser(
  userId: string,
  currentStake: number,
  currentStakeCost: number
): Promise<number> {
  const stakes = await getStakeAmounts();
  const nowSec = Date.now() / 1000;
  let total = 0;
  for (const s of stakes) {
    if (s === currentStake) {
      total += currentStakeCost;
      continue;
    }
    const nextStart = await getNextGameStart(s);
    if (nextStart == null || nextStart <= nowSec) continue;
    const selected = await getSelectedPlayers(s);
    const entry = selected.find((p) => p.user === userId);
    if (entry) total += s * entry.card.length;
  }
  return total;
}

function clearPendingSelectionTimeout(socketId: string): void {
  const t = pendingSelectionTimeouts.get(socketId);
  if (t) {
    clearTimeout(t);
    pendingSelectionTimeouts.delete(socketId);
  }
}

function releasePendingForSocket(io: SocketServer, socketId: string): void {
  const entry = pendingSelections.get(socketId);
  if (!entry) return;
  pendingSelections.delete(socketId);
  clearPendingSelectionTimeout(socketId);
  io.to(roomName(entry.stake)).emit("room_pending_cards", { card_ids: getPendingForRoom(entry.stake) });
  const socket = io.sockets.sockets.get(socketId);
  if (socket) socket.emit("pending_selection_expired", {});
}

function getPendingForRoom(stake: number): number[] {
  const ids: number[] = [];
  for (const sel of pendingSelections.values()) {
    if (sel.stake === stake) {
      ids.push(...sel.cardIds);
    }
  }
  return Array.from(new Set(ids));
}

/** Soft-held cards from other sockets (not yet confirmed). */
function getPendingCardsByOthers(stake: number, excludeSocketId: string): Set<number> {
  const used = new Set<number>();
  for (const [socketId, sel] of pendingSelections.entries()) {
    if (sel.stake === stake && socketId !== excludeSocketId) {
      sel.cardIds.forEach((id) => used.add(id));
    }
  }
  return used;
}

function withPlayerListBotFlag(
  list: SelectedPlayer[]
): Array<SelectedPlayer & { isBot: boolean; name?: string }> {
  return list.map((p) => ({
    ...p,
    isBot: p.user.startsWith(BOT_USER_PREFIX),
    name: p.displayName,
  }));
}

function botNamesFromRp(rp: { names?: unknown } | null): string[] {
  return (rp && Array.isArray(rp.names) ? rp.names : []) as string[];
}

export function registerStakeRoomHandlers(io: SocketServer): void {
  io.on("connection", (socket) => {
    socket.on("join_stake_lobby", async () => {
      socket.join(STAKE_LOBBY_ROOM);
      try {
        const data = await getActiveGamesByStake();
        socket.emit("active_stakes", data);
      } catch (err) {
        console.error("[join_stake_lobby] getActiveGamesByStake:", err);
      }
    });

    socket.on(
      "join_stake_room",
      async (payload: { stake: number; userId?: string; user_id?: string }) => {
        const rawStake = Number(payload?.stake);
        if (!(await isValidStake(rawStake))) {
          socket.emit("error", { message: "Invalid stake" });
          return;
        }
        const stake = rawStake;
        const userId = String(socket.data.userId ?? "");
        socket.join(roomName(stake));
        socket.data.stake = stake;

        const user = await getCustomAuthUserById(userId);
        if (user) {
          socket.emit("user_data", {
            id: user.id,
            name: user.name,
            phone_number: user.phone_number,
            wallet: user.wallet,
            bonus: user.bonus,
            telegram_id: user.telegram_id ?? undefined,
            is_affiliate: user.is_affiliate,
          });
        } else {
          socket.emit("user_data", {
            id: userId,
            name: "Guest",
            phone_number: "",
            wallet: 0,
            bonus: 0,
          });
        }

        await ensureCardPool();

        void resumeNumberLoopIfNeeded(io, stake);

        await reconcileStaleStakeGameState(stake);
        const activeRoundId = await getLiveStakeRoundGameId(stake);

        if (activeRoundId) {
          const called = (await getGameState(activeRoundId, "called_numbers")) as number[] | null;
          socket.emit("game_in_progress", {
            game_id: activeRoundId,
            called_numbers: called ?? [],
          });
          const game = await prisma.game.findUnique({
            where: { id: activeRoundId },
            select: {
              stake: true,
              winnerPrice: true,
              bonus: true,
              status: true,
              playerCard: true,
              gameNumber: true,
            },
          });
          if (game) {
            const playerCard = (game.playerCard as Record<string, number[]>) || {};
            const totalCards = Object.values(playerCard).reduce((s, arr) => s + arr.length, 0);
            const bonusText = (await getBonusForStake(stake)) ? "10X" : "";
            socket.emit("game_stat", {
              running: true,
              game_id: activeRoundId,
              game_number: game.gameNumber != null ? Number(game.gameNumber) : undefined,
              stake: game.stake,
              winner_price: game.winnerPrice,
              player_count: totalCards,
              number_of_players: totalCards,
              bonus: bonusText,
              called_numbers: called ?? [],
            });
          }
        } else {
          const nextStart = await getNextGameStart(stake);
          const nowSec = Date.now() / 1000;
          if (nextStart == null || nextStart < nowSec) {
            await tryStartGame(io, stake);
          }
        }

        const players = await getSelectedPlayers(stake);
        const count = await getPlayerCount(stake);
        const stillActive = await getLiveStakeRoundGameId(stake);
        const nextStart = await getNextGameStart(stake);
        const remaining =
          nextStart != null ? Math.max(0, Math.ceil(nextStart - Date.now() / 1000)) : 0;

        if (!stillActive) {
          socket.emit("game_stat", {
            running: false,
            number_of_players: count,
            stake,
            winner_price: calculateWinnerPrice(stake, count),
            remaining_seconds: remaining,
          });
        }
        socket.emit("player_list", { player_list: withPlayerListBotFlag(players) });
        socket.emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });
      }
    );

    socket.on(
      "confirm_cards",
      async (payload: { user_id?: string; userId?: string; card_ids: any[]; stake?: number | string }) => {
        const rawStake = payload?.stake ? Number(payload.stake) : (socket.data?.stake as number | undefined);
        if (rawStake == null || !(await isValidStake(rawStake))) {
          socket.emit("error", { message: "Invalid stake or room" });
          return;
        }
        const stake = rawStake;

        let savedCardIds: number[] = [];

        try {
          await withStakeLock(stake, async () => {
            const userId = String(
              socket.data?.userId ?? payload?.user_id ?? payload?.userId ?? ""
            );
            if (userId && !socket.data?.userId) {
              socket.data.userId = userId;
            }
            let cardIds = Array.isArray(payload?.card_ids)
              ? payload.card_ids.map(Number).filter((n) => n > 0 && n <= 500)
              : [];

            if (!userId) {
              socket.emit("error", { message: "Not authenticated. Please refresh and login again." });
              return;
            }

            if (cardIds.length === 0) {
              socket.emit("error", { message: "At least one card required" });
              return;
            }

            const uniqueCardIds = Array.from(new Set(cardIds));
            if (uniqueCardIds.length !== cardIds.length) {
              socket.emit("error", { message: "Duplicate cards in selection." });
              return;
            }
            cardIds = uniqueCardIds;

            const activeRoundId = await getLiveStakeRoundGameId(stake);
            if (activeRoundId) {
              socket.emit("error", {
                message: "Game already in progress. Wait for the next round.",
              });
              return;
            }

            const selected = await getSelectedPlayers(stake);
            const usedByOthers = new Set<number>();
            selected.forEach((p) => {
              if (p.user !== userId) {
                p.card.forEach((id) => usedByOthers.add(id));
              }
            });
            getPendingCardsByOthers(stake, socket.id).forEach((id) => usedByOthers.add(id));

            const conflict = cardIds.filter((id) => usedByOthers.has(id));
            if (conflict.length > 0) {
              socket.emit("error", {
                message: `Card${conflict.length > 1 ? "s" : ""} ${conflict.join(", ")} already taken. Pick another.`,
              });
              return;
            }

            const user = await getCustomAuthUserById(userId);
            if (!user) {
              socket.emit("error", { message: "User not found. Please register or login first." });
              return;
            }
            const totalCost = stake * cardIds.length;
            const walletBalance = Number(user.wallet || 0);
            const bonusBalance = Number(user.bonus || 0);
            const totalBalance = walletBalance + bonusBalance;

            const totalRequired = await getPendingCostForUser(userId, stake, totalCost);
            if (totalBalance < totalRequired) {
              socket.emit("error", {
                message:
                  totalRequired > totalCost
                    ? "Insufficient balance. You have other games pending; total required is " +
                    totalRequired.toFixed(2) +
                    "."
                    : "Insufficient balance to join the game.",
              });
              return;
            }

            const next: SelectedPlayer[] = selected.filter((p) => p.user !== userId);
            next.push({ user: userId, card: cardIds, confirmedAt: Date.now() });
            await setSelectedPlayers(stake, next);
            await setPlayerCount(stake, next.reduce((s, p) => s + p.card.length, 0));
            savedCardIds = cardIds;

            clearPendingSelectionTimeout(socket.id);
            pendingSelections.delete(socket.id);
          });

          if (savedCardIds.length === 0) return;

          socket.emit("success", { message: "Cards selected!", card_ids: savedCardIds });

          io.to(roomName(stake)).emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });

          const list = await getSelectedPlayers(stake);
          const newCount = list.reduce((s, p) => s + p.card.length, 0);
          io.to(roomName(stake)).emit("player_list", { player_list: withPlayerListBotFlag(list) });
          const remaining = await getNextGameStart(stake);
          const remSec =
            remaining != null ? Math.max(0, Math.ceil(remaining - Date.now() / 1000)) : 0;
          io.to(roomName(stake)).emit("game_stat", {
            number_of_players: newCount,
            stake,
            winner_price: calculateWinnerPrice(stake, newCount),
            remaining_seconds: remSec,
          });

          // Spread bot joins across the countdown — never dump all bots at once
          const nextStartAfterConfirm = await getNextGameStart(stake);
          const nowAfterConfirm = Date.now() / 1000;
          if (nextStartAfterConfirm == null || nextStartAfterConfirm < nowAfterConfirm) {
            void tryStartGame(io, stake);
          } else if (!botJoinAbort.has(stake)) {
            void scheduleGradualBotJoinsDuringCountdown(io, stake);
          }
        } catch (err) {
          console.error("[confirm_cards] Lock timeout or error:", err);
          socket.emit("error", { message: "Server busy, please try again." });
        }
      }
    );

    socket.on("pending_selection", (payload: { card_ids?: any[]; stake?: number }) => {
      // Use payload.stake if socket not yet in room (e.g. emit before join_stake_room ack)
      const stake =
        (socket.data?.stake as number | undefined) ??
        (typeof payload?.stake === "number" && payload.stake > 0 ? payload.stake : undefined);
      if (stake == null) return;
      if (socket.data) socket.data.stake = stake;
      clearPendingSelectionTimeout(socket.id);
      const cardIds = Array.isArray(payload?.card_ids) ? payload.card_ids.map(Number) : [];
      if (cardIds.length === 0) {
        pendingSelections.delete(socket.id);
        io.to(roomName(stake)).emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });
        return;
      }
      pendingSelections.set(socket.id, { stake, cardIds });
      const t = setTimeout(() => releasePendingForSocket(io, socket.id), PENDING_SELECTION_TTL_MS);
      pendingSelectionTimeouts.set(socket.id, t);
      io.to(roomName(stake)).emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });
    });

    socket.on("remove_number", async (_payload: { userId?: string }) => {
      const stake = socket.data?.stake as number | undefined;
      if (stake == null) return;
      const userId = String(socket.data?.userId ?? "");

      try {
        await withStakeLock(stake, async () => {
          const activeRoundId = await getLiveStakeRoundGameId(stake);
          if (activeRoundId) return;

          const selected = await getSelectedPlayers(stake);
          const next = selected.filter((p) => p.user !== userId);
          await setSelectedPlayers(stake, next);
          await setPlayerCount(stake, next.reduce((s, p) => s + p.card.length, 0));

          clearPendingSelectionTimeout(socket.id);
          pendingSelections.delete(socket.id);

          const list = next;
          const count = list.reduce((s, p) => s + p.card.length, 0);
          io.to(roomName(stake)).emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });
          io.to(roomName(stake)).emit("player_list", { player_list: withPlayerListBotFlag(list) });
          const remaining = await getNextGameStart(stake);
          const remSec =
            remaining != null ? Math.max(0, Math.ceil(remaining - Date.now() / 1000)) : 0;
          io.to(roomName(stake)).emit("game_stat", {
            number_of_players: count,
            stake,
            winner_price: calculateWinnerPrice(stake, count),
            remaining_seconds: remSec,
          });
        });

        socket.emit("player_removed", { user_id: userId });
      } catch (err) {
        console.error("[remove_number] Lock timeout or error:", err);
        socket.emit("error", { message: "Server busy, please try again." });
      }
    });

    socket.on("get_user_stats", async () => {
      const userId = String(socket.data?.userId ?? "");
      if (!userId) return;
      try {
        const stats = await getUserGameStats(userId);
        if (stats) {
          socket.emit("user_stats", stats);
        }
      } catch (err) {
        console.error("[get_user_stats] error:", err);
      }
    });

    socket.on("get_stake_stat", async () => {
      const stake = socket.data?.stake as number | undefined;
      if (stake == null) return;
      try {
        const activeRoundId = await getLiveStakeRoundGameId(stake);
        const count = await getPlayerCount(stake);
        const nextStart = await getNextGameStart(stake);
        const remaining =
          nextStart != null ? Math.max(0, Math.ceil(nextStart - Date.now() / 1000)) : 0;
        if (activeRoundId) {
          let game: {
            winnerPrice: number;
            bonus: number;
            stake: number;
            playerCard: unknown;
            gameNumber: bigint | null;
          } | null = null;
          try {
            game = await prisma.game.findUnique({
              where: { id: activeRoundId },
              select: { winnerPrice: true, bonus: true, stake: true, playerCard: true, gameNumber: true },
            });
          } catch (dbErr) {
            console.error("[get_stake_stat] DB unavailable (game row):", dbErr);
          }
          const called = (await getGameState(activeRoundId, "called_numbers")) as number[] | null;
          const playerCard = (game?.playerCard as Record<string, number[]>) || {};
          const totalCards = Object.values(playerCard).reduce((s, arr) => s + arr.length, 0);

          let bonus10x = false;
          try {
            bonus10x = await getBonusForStake(stake);
          } catch (e) {
            console.error("[get_stake_stat] getBonusForStake:", e);
          }

          socket.emit("game_stat", {
            running: true,
            game_id: activeRoundId,
            game_number: game?.gameNumber != null ? Number(game.gameNumber) : undefined,
            stake: game?.stake ?? stake,
            winner_price: game?.winnerPrice ?? 0,
            player_count: totalCards,
            number_of_players: totalCards,
            bonus: bonus10x ? "10X" : "",
            called_numbers: called ?? [],
          });
        } else {
          socket.emit("game_stat", {
            running: false,
            number_of_players: count,
            stake,
            winner_price: calculateWinnerPrice(stake, count),
            remaining_seconds: remaining,
          });
        }
        const list = await getSelectedPlayers(stake);
        socket.emit("player_list", { player_list: withPlayerListBotFlag(list) });
        socket.emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });
      } catch (err) {
        console.error("[get_stake_stat]", err);
        socket.emit("error", { message: "Could not load room state" });
      }
    });

    socket.on("get_available_cards", async () => {
      const stake = socket.data?.stake as number | undefined;
      if (stake == null) return;
      const selected = await getSelectedPlayers(stake);
      const ids = await getAvailableCardIds(stake, selected);
      socket.emit("available_card_ids", { card_ids: ids });
    });

    socket.on("get_card_preview", async (payload: { card_id: number }) => {
      const cardId = Number(payload?.card_id);
      if (!Number.isInteger(cardId) || cardId < 1 || cardId > 500) return;
      let numbers = getCachedCardPreview(cardId);
      if (!numbers) {
        const map = await getCardNumbers([cardId]);
        numbers = map.get(cardId) ?? null;
        if (numbers) setCachedCardPreview(cardId, numbers);
      }
      if (numbers) socket.emit("card_preview", { card_id: cardId, numbers });
    });

    socket.on("card_data", async (_payload: { userId?: string }) => {
      const stake = socket.data?.stake as number | undefined;
      if (stake == null) return;
      const userId = String(socket.data?.userId ?? "");
      const selected = await getSelectedPlayers(stake);
      const entry = selected.find((p) => p.user === userId);
      if (!entry) {
        socket.emit("no_cards", { message: "No cards found for user." });
        return;
      }
      const cards = await prisma.gameCard.findMany({
        where: { id: { in: entry.card.map((id) => BigInt(id)) } },
        select: { id: true, numbers: true },
      });
      socket.emit("card_data", {
        cards: cards.map((c) => ({ id: Number(c.id), numbers: c.numbers })),
      });
    });

    socket.on("get_my_cards_for_game", async (payload: { game_id?: string; user_id?: string; userId?: string; stake?: number }) => {
      let gameId = payload?.game_id;
      const userId = String(socket.data?.userId ?? "");
      const stake = Number(payload?.stake || socket.data?.stake);

      if (!gameId && !isNaN(stake)) {
        gameId = (await getCurrentGameId(stake)) || undefined;
      }

      if (!gameId) {
        socket.emit("no_cards", { message: "No active game found." });
        return;
      }

      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { playerCard: true },
      });
      if (!game?.playerCard) {
        socket.emit("no_cards", { message: "Game or cards not found." });
        return;
      }
      const playerCard = game.playerCard as Record<string, number[]>;
      const cardIds = playerCard[userId];
      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        socket.emit("no_cards", { message: "No cards for you in this game." });
        return;
      }
      const cards = await prisma.gameCard.findMany({
        where: { id: { in: cardIds.map((id) => BigInt(id)) } },
        select: { id: true, numbers: true },
      });
      socket.emit("card_data", {
        cards: cards.map((c) => ({ id: Number(c.id), numbers: c.numbers })),
      });
    });

    const BINGO_LOG = (msg: string, data?: object) => {
      console.log(`[BINGO] ${msg}`, data !== undefined ? data : "");
    };

    socket.on(
      "bingo",
      async (payload: {
        user_id?: string;
        game_id?: string | number;
        stake?: number;
        claims?: Array<{ card_id: number; marked_numbers: number[] }>;
      }) => {
        const userId = String(socket.data?.userId ?? "");
        const gameId = payload?.game_id != null ? String(payload.game_id) : null;
        const stake = Number(payload?.stake ?? socket.data?.stake ?? 0);
        const claims = Array.isArray(payload?.claims) ? payload.claims : [];

        BINGO_LOG("bingo received", { gameId, userId, stake, claimsCount: claims.length, claimCardIds: claims.map((c) => c.card_id) });

        if (!gameId || !userId || claims.length === 0) {
          BINGO_LOG("reject: missing gameId/userId or no claims");
          socket.emit("result", { data: [{ message: "Not a Bingo" }], game_id: gameId });
          return;
        }

        const lastClaimAt = (await getGameState(gameId, `last_bingo_claim_${userId}`)) as number | null;
        if (typeof lastClaimAt === "number" && Date.now() - lastClaimAt < BINGO_CLAIM_COOLDOWN_MS) {
          BINGO_LOG("reject: claim too soon (rate limit)");
          socket.emit("result", { data: [{ message: "Please wait before claiming again." }], game_id: gameId });
          return;
        }
        await setGameState(gameId, `last_bingo_claim_${userId}`, Date.now());

        const terminated = await getGameState(gameId, `terminated_${userId}`);
        if (terminated) {
          BINGO_LOG("reject: user terminated");
          socket.emit("game_terminated", { reason: "You were removed after 3 invalid bingo attempts.", game_id: gameId });
          return;
        }

        const isRunning = await getGameState(gameId, "is_running");
        const claimWindowOpen = await isGameInClaimWindow(gameId);
        if (!isRunning && !claimWindowOpen) {
          BINGO_LOG("reject: game not running");
          socket.emit("result", { data: [{ message: "Game not running" }], game_id: gameId });
          return;
        }

        const acceptedClaims = (await getGameState(gameId, "accepted_claims")) as string[] | null;
        const acceptedSet = new Set(acceptedClaims ?? []);
        const claimKeys = claims.map((c) => `${userId}:${Number(c.card_id)}`);
        const isDuplicateClaim = claimKeys.some((k) => acceptedSet.has(k));
        if (isDuplicateClaim) {
          BINGO_LOG("idempotent: duplicate claim, re-sending result");
          const resultPayload = (await getGameState(gameId, "result_payload")) as Array<{ user_id: string; name: string; card_id: number; amount_won: number; message: string; winning_numbers?: number[] }> | null;
          if (Array.isArray(resultPayload) && resultPayload.length > 0) {
            socket.emit("result", { data: resultPayload, game_id: gameId });
          } else {
            socket.emit("result", { data: [{ message: "Bingo", already_received: true }], game_id: gameId });
          }
          return;
        }

        const bingoAlready = await getGameState(gameId, "bingo");
        if (bingoAlready && !claimWindowOpen) {
          BINGO_LOG("reject: bingo already claimed");
          const resultPayload = (await getGameState(gameId, "result_payload")) as Array<{
            user_id: string;
            name: string;
            card_id: number;
            amount_won: number;
            message: string;
            winning_numbers?: number[];
          }> | null;
          if (Array.isArray(resultPayload) && resultPayload.length > 0) {
            socket.emit("result", { data: resultPayload, game_id: gameId });
          } else {
            socket.emit("result", { data: [{ message: "Bingo already claimed" }], game_id: gameId });
          }
          return;
        }

        const game = await prisma.game.findUnique({
          where: { id: gameId },
          select: {
            playerCard: true,
            calledNumbers: true,
            winnerPrice: true,
            stake: true,
            jackpotAwarded: true,
            adminCut: true,
          },
        });
        if (!game?.playerCard) {
          BINGO_LOG("reject: no game or no playerCard");
          socket.emit("result", { data: [{ message: "Not a Bingo" }], game_id: gameId });
          return;
        }

        const playerCard = game.playerCard as Record<string, number[]>;
        const playerCardKeys = Object.keys(playerCard || {});
        const userKey = playerCardKeys.find((k) => String(k) === String(userId)) ?? userId;
        const userCardIds = Array.isArray(playerCard[userKey]) ? playerCard[userKey] : [];
        const dbCalled = (game.calledNumbers as number[] | null) ?? [];
        const redisCalled = (await getGameState(gameId, "called_numbers")) as number[] | null;
        const rawCalled = (redisCalled && redisCalled.length > 0 ? redisCalled : dbCalled) as unknown[];
        const effectiveCalled = [...rawCalled.map(Number).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 75), 0];
        const effectiveCalledSet = new Set(effectiveCalled);
        const calledForValidation = Array.from(effectiveCalledSet);

        BINGO_LOG("validation state", {
          playerCardKeys,
          userKey,
          userCardIds,
          dbCalledLen: dbCalled.length,
          redisCalledLen: redisCalled?.length ?? 0,
          calledForValidationLen: calledForValidation.length,
          calledSample: calledForValidation.slice(0, 15),
        });

        const winners: { user_id: string; card_id: number; numbers: number[][]; winning_numbers?: number[] }[] = [];
        const userCardIdSet = new Set(userCardIds.map(Number));
        for (const { card_id } of claims) {
          const cid = Number(card_id);
          const inSet = userCardIdSet.has(cid);
          if (!inSet) {
            BINGO_LOG("skip claim: card_id not in user's cards", { cid, userCardIds });
            continue;
          }
          const cardRow = await prisma.gameCard.findUnique({
            where: { id: BigInt(cid) },
            select: { numbers: true },
          });
          if (!cardRow?.numbers) {
            BINGO_LOG("skip claim: no card row or numbers", { cid });
            continue;
          }
          const cardNumbers = toRowMajorNumbers(cardRow.numbers);
          if (cardNumbers.length !== 5) {
            BINGO_LOG("skip claim: toRowMajorNumbers invalid", { cid, cardNumbersLength: cardNumbers.length, rawNumbers: cardRow.numbers });
            continue;
          }
          const cardAsNumbers = cardNumbers.map((row) => row.map(Number));
          const win = hasBingo(cardAsNumbers, calledForValidation);
          BINGO_LOG("card check", { cid, hasWin: !!win, cardFlat: cardAsNumbers.flat().slice(0, 10) });
          if (win) {
            winners.push({ user_id: userId, card_id: cid, numbers: cardAsNumbers, winning_numbers: win });
            break;
          }
        }

        if (winners.length > 0) {
          const winner = winners[0];
          const favoredSide = await getGameState(gameId, "favored_side");
          const botFavored =
            favoredSide === "bot" || process.env.RIG_BOT_WINS === "true";
          if (botFavored && !userId.startsWith(BOT_USER_PREFIX)) {
            BINGO_LOG("valid human bingo on bot-favored round — not paying this claim", {
              winnerCardId: winner.card_id,
            });
            const resultPayload = (await getGameState(gameId, "result_payload")) as Array<{
              user_id: string;
              name: string;
              card_id: number;
              amount_won: number;
              message: string;
              winning_numbers?: number[];
            }> | null;
            if (Array.isArray(resultPayload) && resultPayload.length > 0) {
              socket.emit("result", { data: resultPayload, game_id: gameId });
            }
            return;
          }

          BINGO_LOG("bingo VALID — entering claim window", { winnerCardId: winner.card_id });

          await enqueueBingoClaim(gameId, async () => {
            await maybeFinalizeExpiredClaim(io, gameId);

            const bingoResolved = await getGameState(gameId, "bingo");
            if (bingoResolved) {
              BINGO_LOG("claim window: game already resolved");
              const resultPayload = (await getGameState(gameId, "result_payload")) as Array<{
                user_id: string;
                name: string;
                card_id: number;
                amount_won: number;
                message: string;
                winning_numbers?: number[];
              }> | null;
              if (Array.isArray(resultPayload) && resultPayload.length > 0) {
                socket.emit("result", { data: resultPayload, game_id: gameId });
              } else {
                socket.emit("result", { data: [{ message: "Bingo already claimed" }], game_id: gameId });
              }
              return;
            }

            const { added, winnersCount, alreadyResolved } = await persistClaimWinner(
              io,
              stake,
              gameId,
              calledForValidation,
              winner,
              {
                winnerPrice: game.winnerPrice ?? 0,
                stake: game.stake ?? stake,
                playerCard,
                adminCut: game.adminCut ?? 0,
                jackpotAwarded: game.jackpotAwarded ?? 0,
              }
            );

            if (alreadyResolved) {
              const resultPayload = (await getGameState(gameId, "result_payload")) as Array<{
                user_id: string;
                name: string;
                card_id: number;
                amount_won: number;
                message: string;
                winning_numbers?: number[];
              }> | null;
              if (Array.isArray(resultPayload) && resultPayload.length > 0) {
                socket.emit("result", { data: resultPayload, game_id: gameId });
              } else {
                socket.emit("result", { data: [{ message: "Bingo already claimed" }], game_id: gameId });
              }
              return;
            }

            if (added) {
              const claimedWinners = await loadClaimWinners(gameId);
              io.to(roomName(stake)).emit("bingo_claimed", {
                game_id: gameId,
                winners_count: winnersCount,
                winners: claimedWinners.map((w) => ({ user_id: w.user_id, card_id: w.card_id })),
              });
            }

            socket.emit("bingo_claim_pending", {
              game_id: gameId,
              message:
                winnersCount > 1
                  ? `Valid bingo! ${winnersCount} winners — splitting prize...`
                  : "Valid bingo! Checking for other simultaneous winners...",
              winners_count: winnersCount,
              window_ms: BINGO_CLAIM_WINDOW_MS,
            });
          });
        } else {
          BINGO_LOG("bingo REJECTED: no winning card found", {
            userId,
            gameId,
            userCardIds,
            calledLen: calledForValidation.length,
            claimsChecked: claims.length,
          });
          const invalidKey = `invalid_bingo_${userId}`;
          const current = (await getGameState(gameId, invalidKey)) as number | null;
          const attempts = typeof current === "number" ? current + 1 : 1;
          await setGameState(gameId, invalidKey, attempts);

          socket.emit("result", {
            data: [{ message: "Not a Bingo", invalid_attempt: attempts, max_attempts: 3 }],
            game_id: gameId,
          });

          if (attempts >= 3) {
            await setGameState(gameId, `terminated_${userId}`, true);
            io.to(roomName(stake)).emit("player_kicked", {
              user_id: userId,
              reason: "false_bingo",
            });
            socket.emit("game_terminated", {
              reason: "You have been removed from the game after 3 invalid bingo attempts.",
              game_id: gameId,
            });
          }
        }
      }
    );

    socket.on("block_user", async (payload: { userId?: string; user_id?: string }) => {
      const stake = socket.data?.stake as number | undefined;
      if (stake == null) return;
      const adminId = String(socket.data?.userId ?? "");
      const targetId = String(payload?.userId ?? payload?.user_id ?? "");

      if (!targetId) {
        socket.emit("error", { message: "User ID required to block." });
        return;
      }

      const admin = await getCustomAuthUserById(adminId);
      if (!admin?.is_staff) {
        socket.emit("error", { message: "Only staff can block users." });
        return;
      }

      const selected = await getSelectedPlayers(stake);
      const next = selected.filter((p) => p.user !== targetId);
      await setSelectedPlayers(stake, next);
      await setPlayerCount(stake, next.reduce((s, p) => s + p.card.length, 0));

      io.to(roomName(stake)).emit("player_kicked", {
        user_id: targetId,
        reason: "blocked",
      });
      io.to(roomName(stake)).emit("player_list", { player_list: withPlayerListBotFlag(next) });
    });

    socket.on("disconnect", () => {
      const stake = socket.data?.stake as number | undefined;
      if (stake && pendingSelections.has(socket.id)) {
        clearPendingSelectionTimeout(socket.id);
        pendingSelections.delete(socket.id);
        io.to(roomName(stake)).emit("room_pending_cards", { card_ids: getPendingForRoom(stake) });
      }
    });
  });
}

async function failGameAndClearStake(stake: number, gameId: string): Promise<void> {
  activeNumberLoops.delete(gameId);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { playerCard: true, stake: true, status: true, winner: true },
  });

  const bingoPaid = (await getGameState(gameId, "bingo")) === true;
  const hasWinners = Array.isArray(game?.winner) && game.winner.length > 0;
  if (bingoPaid || hasWinners || game?.status === "closed") {
    console.warn(`[failGame] skip refund for ${gameId} — already settled (bingo=${bingoPaid}, winners=${hasWinners}, status=${game?.status})`);
    await setGameState(gameId, "is_running", false).catch(() => { });
    const current = await getCurrentGameId(stake);
    if (current === gameId) {
      await setCurrentGameId(stake, null);
      await setNextGameStart(stake, null);
    }
    return;
  }

  if (game?.playerCard && game.status !== "closed") {
    await settleGameRefundOnce(gameId, "orphaned_game");
  }

  await setGameState(gameId, "is_running", false).catch(() => { });
  await clearGameState(gameId).catch(() => { });
  const current = await getCurrentGameId(stake);
  if (current === gameId) {
    await setCurrentGameId(stake, null);
    await setNextGameStart(stake, null);
  }
  await withDbRetry(() =>
    prisma.game.updateMany({
      where: { id: gameId, status: { not: "closed" } },
      data: { status: "failed" },
    })
  ).catch((err) => console.error("[failGameAndClearStake]", gameId, err));
}

async function clearOrphanedPlayingGames(stake: number): Promise<void> {
  const redisId = await getCurrentGameId(stake);
  const playing = await prisma.game.findMany({
    where: { stake, status: "playing" },
    select: { id: true, startedAt: true, createdAt: true, winner: true },
  });
  if (playing.length === 0) return;

  const STUCK_THRESHOLD_MS = 6 * 60 * 1000; // 6 minutes (longer than maximum bingo game duration)

  for (const g of playing) {
    if (await isGameInClaimWindow(g.id)) continue;
    if (Array.isArray(g.winner) && g.winner.length > 0) continue;
    if ((await getGameState(g.id, "bingo")) === true) continue;

    const startedAt = g.startedAt ?? g.createdAt;
    const elapsed = Date.now() - startedAt.getTime();

    const isRunning = (await getGameState(g.id, "is_running")) === true;
    if (isRunning) continue;

    if (elapsed < STUCK_THRESHOLD_MS) {
      if (redisId === g.id) continue;
      if (elapsed < 60_000) continue; // 60s grace period for any new game
    }

    console.log(`[clearOrphaned] Failing orphaned playing game ${g.id} for stake ${stake} (elapsed ${Math.round(elapsed / 1000)}s)`);
    await failGameAndClearStake(stake, g.id);
  }

  if (redisId) {
    const redisStillValid = playing.some((g) => g.id === redisId);
    const redisRunning = (await getGameState(redisId, "is_running")) === true;
    if (!redisStillValid || !redisRunning) {
      await setCurrentGameId(stake, null);
      await setNextGameStart(stake, null);
    }
  }
}

/**
 * A round is live only when Redis and DB agree on the same game id.
 * Never infer "running" from DB alone — that blocked the 30s lobby forever.
 */
async function getLiveStakeRoundGameId(stake: number): Promise<string | null> {
  await reconcileStaleStakeGameState(stake);
  await clearOrphanedPlayingGames(stake);

  const gameId = await getCurrentGameId(stake);
  if (!gameId) return null;

  const isRunning = (await getGameState(gameId, "is_running")) === true;
  const claimWindow = await isGameInClaimWindow(gameId);
  if (!isRunning && !claimWindow) return null;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, stake: true },
  });
  if (game?.status !== "playing" || game.stake !== stake) {
    await reconcileStaleStakeGameState(stake);
    return null;
  }

  return gameId;
}

/**
 * Redis can still show is_running after DB marks a game failed/closed (e.g. stuck-game cron
 * or server crash). That blocks tryStartGame forever — clear stale keys before any gate check.
 */
async function reconcileStaleStakeGameState(stake: number): Promise<boolean> {
  const gameId = await getCurrentGameId(stake);
  if (!gameId) return false;

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });

  const isRunningFlag = await getGameState(gameId, "is_running");
  const dbStillPlaying = game?.status === "playing";
  const claimWindow = await isGameInClaimWindow(gameId);

  if (dbStillPlaying && (isRunningFlag || claimWindow)) return false;

  if (!dbStillPlaying || !isRunningFlag) {
    console.log(
      `[reconcile] Clearing stale stake ${stake} game ${gameId} (db=${game?.status ?? "missing"}, redis_running=${isRunningFlag})`
    );
    activeNumberLoops.delete(gameId);
    await setGameState(gameId, "is_running", false);
    await clearGameState(gameId);
    await setCurrentGameId(stake, null);
    await setNextGameStart(stake, null);
    return true;
  }

  return false;
}

async function tryStartGame(io: SocketServer, stake: number): Promise<void> {
  await reconcileStaleStakeGameState(stake);
  // Never block round start on slow orphan refunds (remote DB can take >5s).
  // Run cleanup in the background with a hard timeout so confirm → countdown stays snappy.
  void Promise.race([
    clearOrphanedPlayingGames(stake),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]).catch((err) => console.error("[tryStartGame] orphan cleanup:", err));

  if (await getLiveStakeRoundGameId(stake)) return;

  await withPrepareLock(stake, async () => {
    if (await getLiveStakeRoundGameId(stake)) return;

    const holdMs = await getStakeStartHoldRemainingMs(stake);
    if (holdMs > 0) {
      setTimeout(() => {
        void tryStartGame(io, stake);
      }, Math.min(holdMs + 100, 10_000));
      return;
    }

    const nowSec = Date.now() / 1000;
    const nextStart = await getNextGameStart(stake);

    if (nextStart != null && nextStart >= nowSec && prepareGameTimers.has(stake)) {
      return;
    }

    if (nextStart != null && nextStart >= nowSec) {
      return;
    }

    const existingPrepare = prepareGameTimers.get(stake);
    if (existingPrepare) clearTimeout(existingPrepare);

    const existingSync = countdownSyncIntervals.get(stake);
    if (existingSync) {
      clearInterval(existingSync);
      countdownSyncIntervals.delete(stake);
    }

    const countdownSec = await getGameStartCountdownSec();
    const scheduledStart = nowSec + countdownSec;
    await setNextGameStart(stake, scheduledStart);
    await primeBotRoundTarget(stake);

    cancelBotJoinSchedule(stake);
    const humans = await clearBotSelections(stake);
    const hadHumans = humans.length > 0;
    await emitRoomGameStat(io, stake, humans);
    io.to(roomName(stake)).emit("lobby_reset", {
      reason: "new_round",
      keep_selection: hadHumans,
    });

    io.to(roomName(stake)).emit("timer_message", {
      remaining_seconds: countdownSec,
    });

    const syncInterval = setInterval(() => {
      getNextGameStart(stake).then((currentNextStart) => {
        if (!currentNextStart) {
          clearInterval(syncInterval);
          countdownSyncIntervals.delete(stake);
          return;
        }
        const remaining = Math.max(0, Math.ceil(currentNextStart - Date.now() / 1000));
        if (remaining <= 0) {
          clearInterval(syncInterval);
          countdownSyncIntervals.delete(stake);
        } else {
          io.to(roomName(stake)).emit("timer_message", {
            remaining_seconds: remaining,
          });
        }
      });
    }, 1000);
    countdownSyncIntervals.set(stake, syncInterval);

    void scheduleGradualBotJoinsDuringCountdown(io, stake);

    const prepareTimer = setTimeout(() => {
      prepareGameTimers.delete(stake);
      void prepareGameAndDeduct(io, stake);
    }, countdownSec * 1000);
    prepareGameTimers.set(stake, prepareTimer);
  });
}

/** Emit player count + prize from the DB game snapshot (fixed at round start). */
async function emitFrozenGameStat(io: SocketServer, stake: number, gameId: string): Promise<void> {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { winnerPrice: true, stake: true, playerCard: true, gameNumber: true },
    });
    if (!game) return;
    const playerCard = (game.playerCard as Record<string, number[]>) || {};
    const totalCards = Object.values(playerCard).reduce((s, arr) => s + arr.length, 0);
    let bonusText = "";
    try {
      bonusText = (await getBonusForStake(stake)) ? "10X" : "";
    } catch {
      /* ignore */
    }
    const called = (await getGameState(gameId, "called_numbers")) as number[] | null;
    io.to(roomName(stake)).emit("game_stat", {
      running: true,
      game_id: gameId,
      game_number: game.gameNumber != null ? Number(game.gameNumber) : undefined,
      stake: game.stake,
      winner_price: game.winnerPrice,
      player_count: totalCards,
      number_of_players: totalCards,
      bonus: bonusText,
      called_numbers: called ?? [],
    });
  } catch (err) {
    console.error("[emitFrozenGameStat]", err);
  }
}

async function emitRoomGameStat(io: SocketServer, stake: number, list: SelectedPlayer[]): Promise<void> {
  const remaining = await getNextGameStart(stake);
  const remSec = remaining != null ? Math.max(0, Math.ceil(remaining - Date.now() / 1000)) : 0;
  const currentCount = list.reduce((s, p) => s + p.card.length, 0);
  io.to(roomName(stake)).emit("player_list", { player_list: withPlayerListBotFlag(list) });
  io.to(roomName(stake)).emit("game_stat", {
    number_of_players: currentCount,
    stake,
    winner_price: calculateWinnerPrice(stake, currentCount),
    remaining_seconds: remSec,
  });
}

async function primeBotRoundTarget(stake: number): Promise<void> {
  await refreshBotScheduleCache();
  await refreshBotScheduleCacheForStake(stake);
  const rp = await prisma.randomPlayer.findFirst({
    where: { on_off: true, stake },
    orderBy: { id: "asc" },
  });
  const target = rollBotTargetCardCount(rp, DEFAULT_BOT_CARDS, new Date(), stake);
  botRoundTargetByStake.set(stake, target);
  const slot = getBotScheduleSlot();
  console.log(
    `[bot-schedule] stake=${stake} slot=${slot.id} (${slot.label}) target_cards=${target}`
  );
}

function clearBotRoundTarget(stake: number): void {
  botRoundTargetByStake.delete(stake);
}

function getTargetBotCardCount(
  rp: { number_of_players?: number | null } | null,
  stake: number
): number {
  const cached = botRoundTargetByStake.get(stake);
  if (cached != null) return cached;
  const target = rollBotTargetCardCount(rp, DEFAULT_BOT_CARDS, new Date(), stake);
  botRoundTargetByStake.set(stake, target);
  return target;
}

function countBotCards(players: SelectedPlayer[]): number {
  return players
    .filter((p) => p.user.startsWith(BOT_USER_PREFIX))
    .reduce((s, p) => s + p.card.length, 0);
}

function botJoinDelayMs(): number {
  return BOT_JOIN_DELAY_MS_MIN + Math.floor(Math.random() * (BOT_JOIN_DELAY_MS_VARIANCE + 1));
}

function cancelBotJoinSchedule(stake: number): void {
  const ctrl = botJoinAbort.get(stake);
  if (ctrl) ctrl.cancelled = true;
  botJoinAbort.delete(stake);
}

function countdownJoinGapMs(perBotMs: number, minGap: number): number {
  const jitter = 0.4 + Math.random() * 1.2;
  return Math.max(minGap, Math.floor(perBotMs * jitter));
}

/** Strip bot picks between rounds; humans stay on the board. */
async function clearBotSelections(stake: number): Promise<SelectedPlayer[]> {
  const selected = await getSelectedPlayers(stake);
  const humans = selected
    .filter((p) => !p.user.startsWith(BOT_USER_PREFIX))
    .map((p) => ({ ...p, card: [...p.card] }));
  await setSelectedPlayers(stake, humans);
  await setPlayerCount(stake, humans.reduce((s, p) => s + p.card.length, 0));
  return humans;
}

/** Clear every lobby pick — used when a fresh countdown starts or a game goes live. */
async function clearAllLobbySelections(stake: number): Promise<void> {
  await setSelectedPlayers(stake, []);
  await setPlayerCount(stake, 0);
}

/** Add a single bot card if below target. Returns true when one was added. */
async function addOneBotIfNeeded(io: SocketServer, stake: number): Promise<boolean> {
  const rp = await prisma.randomPlayer.findFirst({
    where: { on_off: true, stake },
    orderBy: { id: "asc" },
  });
  if (!rp) return false;

  const targetBotCards = getTargetBotCardCount(rp, stake);
  const botNames = botNamesFromRp(rp);
  const selected = await getSelectedPlayers(stake);
  const realPlayers = selected
    .filter((p) => !p.user.startsWith(BOT_USER_PREFIX))
    .map((p) => ({ ...p, card: [...p.card] }));
  const existingBots = selected
    .filter((p) => p.user.startsWith(BOT_USER_PREFIX))
    .map((p) => ensureBotIdentity({ ...p, card: [...p.card] }, botNames));

  let list: SelectedPlayer[] = [...realPlayers, ...existingBots];
  const currentBotCards = countBotCards(list);
  if (currentBotCards >= targetBotCards) return false;

  const maxAffordable = Math.floor(rp.wallet / stake);
  if (currentBotCards >= maxAffordable) return false;

  const availableIds = await getAvailableCardIds(stake, list);
  if (availableIds.length === 0) return false;

  const cardId = shuffleArray(availableIds)[0];
  const newBotIndex = list.filter((p) => p.user.startsWith(BOT_USER_PREFIX)).length;
  list.push(
    ensureBotIdentity({ user: `${BOT_USER_PREFIX}${stake}_${newBotIndex}`, card: [cardId] }, botNames)
  );

  await setSelectedPlayers(stake, list);
  await setPlayerCount(stake, list.reduce((s, p) => s + p.card.length, 0));
  await emitRoomGameStat(io, stake, list);
  return true;
}

/** Spread bot joins across the 30s lobby countdown so the room fills naturally. */
function scheduleGradualBotJoinsDuringCountdown(
  io: SocketServer,
  stake: number
): void {
  if (botJoinAbort.has(stake)) return;

  const abort = { cancelled: false };
  botJoinAbort.set(stake, abort);

  void (async () => {
    try {
      const rp = await prisma.randomPlayer.findFirst({
        where: {
          on_off: true,
          stake,
        },
        orderBy: {
          id: "asc",
        },
      });

      if (!rp || abort.cancelled) return;

      const target = getTargetBotCardCount(rp, stake);
      const maxAffordable = Math.floor(rp.wallet / stake);
      const planned = Math.min(target, maxAffordable);

      if (planned < 1) return;

      let selected = await getSelectedPlayers(stake);
      let currentBotCards = countBotCards(selected);

      const hasHuman = selected.some(
        (p) => !p.user.startsWith(BOT_USER_PREFIX)
      );

      // First join delay
      if (currentBotCards === 0) {
        const firstWait = hasHuman
          ? 600 + Math.floor(Math.random() * 1800)
          : planned >= 80
            ? 1000 + Math.floor(Math.random() * 2000) // 1-3 sec for large rooms
            : BOT_FIRST_JOIN_DELAY_MIN_MS +
            Math.floor(
              Math.random() *
              (
                BOT_FIRST_JOIN_DELAY_MAX_MS -
                BOT_FIRST_JOIN_DELAY_MIN_MS +
                1
              )
            );

        await new Promise((r) => setTimeout(r, firstWait));

        if (abort.cancelled) return;
      }

      while (!abort.cancelled) {
        const nextStart = await getNextGameStart(stake);

        if (nextStart == null) break;

        const msLeft = nextStart * 1000 - Date.now();

        // stop shortly before game starts
        if (msLeft <= BOT_JOIN_STOP_BEFORE_END_MS) break;

        selected = await getSelectedPlayers(stake);
        currentBotCards = countBotCards(selected);

        if (currentBotCards >= planned) break;

        const added = await addOneBotIfNeeded(io, stake);
        if (!added) break;

        selected = await getSelectedPlayers(stake);
        currentBotCards = countBotCards(selected);

        const remaining = planned - currentBotCards;
        if (remaining <= 0) break;

        const joinWindowMs = Math.max(2000, msLeft - BOT_JOIN_STOP_BEFORE_END_MS);
        const minGap =
          planned >= 150 ? 70 : planned >= 100 ? 90 : planned >= 70 ? 120 : planned >= 40 ? 180 : 350;
        const maxGap = planned >= 70 ? 900 : 2200;
        const behind = remaining * minGap > joinWindowMs;
        const paceMs = behind ? minGap : Math.min(maxGap, Math.max(minGap, Math.floor(joinWindowMs / remaining)));
        let waitMs = countdownJoinGapMs(paceMs, minGap);
        if (!behind && Math.random() < 0.1) {
          waitMs += 250 + Math.floor(Math.random() * 700);
        }

        await new Promise((r) => setTimeout(r, waitMs));
      }
    } catch (err) {
      console.error(
        "[scheduleGradualBotJoins]",
        stake,
        err
      );
    } finally {
      if (botJoinAbort.get(stake) === abort) {
        botJoinAbort.delete(stake);
      }
    }
  })();
}
/** Remove human picks from the lobby; bots stay selected between rounds. */
async function clearHumanSelectionsKeepBots(stake: number): Promise<SelectedPlayer[]> {
  const selected = await getSelectedPlayers(stake);
  const bots = selected
    .filter((p) => p.user.startsWith(BOT_USER_PREFIX))
    .map((p) => ({ ...p, card: [...p.card] }));
  await setSelectedPlayers(stake, bots);
  await setPlayerCount(stake, bots.reduce((s, p) => s + p.card.length, 0));
  return bots;
}

async function syncBotsToRealPlayers(
  io: SocketServer,
  stake: number,
  options?: { fillRemaining?: boolean }
): Promise<void> {
  if (options?.fillRemaining) {
    while (await addOneBotIfNeeded(io, stake)) {
      /* top up silently before game start */
    }
    return;
  }

  const rp = await prisma.randomPlayer.findFirst({
    where: { on_off: true, stake },
    orderBy: { id: "asc" },
  });
  if (!rp) return;

  const targetBotCards = getTargetBotCardCount(rp, stake);
  const botNames = botNamesFromRp(rp);
  const selected = await getSelectedPlayers(stake);
  const realPlayers = selected
    .filter((p) => !p.user.startsWith(BOT_USER_PREFIX))
    .map((p) => ({ ...p, card: [...p.card] }));

  const existingBots = selected
    .filter((p) => p.user.startsWith(BOT_USER_PREFIX))
    .map((p) => ensureBotIdentity({ ...p, card: [...p.card] }, botNames));

  let list: SelectedPlayer[] = [...realPlayers, ...existingBots];
  let currentBotCards = countBotCards(list);

  // Trim excess bot cards down to base + round bonus
  while (currentBotCards > targetBotCards) {
    const bots = list.filter((p) => p.user.startsWith(BOT_USER_PREFIX));
    const lastBot = bots[bots.length - 1];
    if (!lastBot) break;
    if (lastBot.card.length > 1) {
      lastBot.card.pop();
    } else {
      const idx = list.findIndex((p) => p.user === lastBot.user);
      if (idx >= 0) list.splice(idx, 1);
    }
    currentBotCards--;
    await setSelectedPlayers(stake, list);
    await setPlayerCount(stake, list.reduce((s, p) => s + p.card.length, 0));
    await emitRoomGameStat(io, stake, list);
    await new Promise((res) => setTimeout(res, botJoinDelayMs()));
  }

  const cardsToAdd = targetBotCards - currentBotCards;
  if (cardsToAdd <= 0) {
    await setSelectedPlayers(stake, list);
    await setPlayerCount(stake, list.reduce((s, p) => s + p.card.length, 0));
    if (list.length > 0) await emitRoomGameStat(io, stake, list);
    return;
  }

  const maxAffordable = Math.floor(rp.wallet / stake);
  const affordableToAdd = Math.min(cardsToAdd, maxAffordable);
  if (affordableToAdd < 1) {
    await setSelectedPlayers(stake, list);
    await setPlayerCount(stake, list.reduce((s, p) => s + p.card.length, 0));
    if (list.length > 0) await emitRoomGameStat(io, stake, list);
    return;
  }

  const availableIds = await getAvailableCardIds(stake, list);
  const shuffled = shuffleArray(availableIds);
  let newBotIndex = list.filter((p) => p.user.startsWith(BOT_USER_PREFIX)).length;

  for (let a = 0; a < affordableToAdd && shuffled.length > 0; a++) {
    const cardId = shuffled.pop()!;
    const botId = `${BOT_USER_PREFIX}${stake}_${newBotIndex}`;
    newBotIndex += 1;
    list.push(ensureBotIdentity({ user: botId, card: [cardId] }, botNames));

    await setSelectedPlayers(stake, list);
    await setPlayerCount(stake, list.reduce((s, p) => s + p.card.length, 0));
    await emitRoomGameStat(io, stake, list);
    if (a < affordableToAdd - 1) await new Promise((res) => setTimeout(res, botJoinDelayMs()));
  }

  await setSelectedPlayers(stake, list);
  await setPlayerCount(stake, list.reduce((s, p) => s + p.card.length, 0));
  await emitRoomGameStat(io, stake, list);
}

/** Stakes that have RandomPlayer with on_off true and wallet > 0 (bots can run). */
async function getStakesWithBotsEnabled(): Promise<number[]> {
  const rows = await (prisma as any).randomPlayer.findMany({
    where: { on_off: true, wallet: { gt: 0 } },
    select: { stake: true },
    distinct: ["stake"],
  });
  return (rows ?? []).map((r: { stake: number }) => Number(r.stake)).filter((s: number) => s > 0);
}

const AUTO_BOT_START_INTERVAL_MS = 45 * 1000; // check every 45s

const SELECTION_STALE_TIMEOUT_MS = 2 * 60 * 1000;

async function cleanupStaleSelections(io: SocketServer): Promise<void> {
  try {
    const stakes = await getStakeAmounts();
    const now = Date.now();

    for (const stake of stakes) {
      const selected = await getSelectedPlayers(stake);
      if (selected.length === 0) continue;

      const currentGameId = await getCurrentGameId(stake);
      const isRunning = currentGameId ? (await getGameState(currentGameId, "is_running")) === true : false;
      if (isRunning) continue;

      let modified = false;
      const nextList = selected.filter((p) => {
        if (p.user.startsWith(BOT_USER_PREFIX)) return true;
        if (p.confirmedAt && now - p.confirmedAt > SELECTION_STALE_TIMEOUT_MS) {
          modified = true;
          return false;
        }
        return true;
      });

      if (modified) {
        console.log(`[cleanup] Removing stale selections for stake ${stake}.`);
        await setSelectedPlayers(stake, nextList);
        await setPlayerCount(stake, nextList.reduce((s, p) => s + p.card.length, 0));
        await emitRoomGameStat(io, stake, nextList);
      }
    }
  } catch (err) {
    console.error("[cleanupStaleSelections] error:", err);
  }
}

/**
 * Periodically try to start the countdown for stakes that have bots enabled,
 * so games can start with only bots even when no human is in the room.
 */
export function startAutoBotStart(io: SocketServer, options?: { delayFirstRunMs?: number }): void {
  const delayFirstRunMs = options?.delayFirstRunMs ?? 8000;
  const run = async () => {
    try {
      // 1. Cleanup stale human selections (if they've been waiting > 2 mins)
      await cleanupStaleSelections(io);

      // 2. Clear Redis/DB mismatches so countdown can restart
      const stakes = await getStakesWithBotsEnabled();
      for (const stake of stakes) {
        await reconcileStaleStakeGameState(stake);
      }

      // 3. Try start games for bot-enabled stakes
      for (const stake of stakes) {
        try {
          await tryStartGame(io, stake);
        } catch (err) {
          console.error(`[auto-bot-start] tryStartGame stake ${stake}:`, err);
        }
      }
    } catch (err) {
      console.error("[auto-bot-start] error:", err);
    }
  };
  setTimeout(run, delayFirstRunMs);
  setInterval(run, AUTO_BOT_START_INTERVAL_MS);
  console.log("[auto-bot-start] started, interval=" + AUTO_BOT_START_INTERVAL_MS / 1000 + "s");
}

async function tryAddingRandomPlayers(io: SocketServer, stake: number): Promise<void> {
  const rp = await prisma.randomPlayer.findFirst({
    where: { on_off: true, stake },
    orderBy: { id: "asc" },
  });
  if (!rp) return;

  let numBots = typeof rp.number_of_players === "number" ? rp.number_of_players : 0;
  if (numBots < 1) return;
  numBots = Math.max(1, numBots + Math.floor(Math.random() * 12) - 6);
  const cardsPerBot = numBots >= 10 ? 2 : 1;

  const selected = await getSelectedPlayers(stake);
  const hasRealPlayer = selected.some((p) => !p.user.startsWith(BOT_USER_PREFIX));
  if (!hasRealPlayer) return;

  const availableIds = await getAvailableCardIds(stake, selected);
  const maxBots = Math.floor(availableIds.length / cardsPerBot);
  if (maxBots < 1) return;
  numBots = Math.min(numBots, maxBots);

  const totalBotCost = numBots * cardsPerBot * stake;
  if (rp.wallet < totalBotCost) return;

  const botNames = botNamesFromRp(rp);
  const shuffled = shuffleArray(availableIds);

  for (let i = 0; i < numBots; i++) {
    const cardIds: number[] = [];
    for (let j = 0; j < cardsPerBot && shuffled.length > 0; j++) {
      cardIds.push(shuffled.pop()!);
    }
    if (cardIds.length > 0) {
      selected.push(ensureBotIdentity({ user: `${BOT_USER_PREFIX}${stake}_${i}`, card: cardIds }, botNames));
    }
  }

  if (selected.some((p) => p.user.startsWith(BOT_USER_PREFIX))) {
    await setSelectedPlayers(stake, selected);
    await setPlayerCount(stake, selected.reduce((s, p) => s + p.card.length, 0));
    io.to(roomName(stake)).emit("player_list", { player_list: withPlayerListBotFlag(selected) });
  }
}

type FavoredSide = "bot" | "human" | "none";

async function pickFavoredSide(selected: SelectedPlayer[]): Promise<FavoredSide> {
  if (process.env.RIG_BOT_WINS === "true") return "bot";

  const hasBots = selected.some(
    (p) => p.user.startsWith(BOT_USER_PREFIX) && Array.isArray(p.card) && p.card.length > 0
  );
  const hasHumans = selected.some(
    (p) => !p.user.startsWith(BOT_USER_PREFIX) && Array.isArray(p.card) && p.card.length > 0
  );
  if (!hasBots || !hasHumans) return "none";

  const botWinPercent = await getBotWinPercent();
  if (botWinPercent == null) return "none";
  return Math.random() * 100 < botWinPercent ? "bot" : "human";
}

async function loadRowMajorGrids(cardIds: number[]): Promise<number[][][]> {
  if (cardIds.length === 0) return [];
  const map = await getCardNumbers(cardIds);
  const grids: number[][][] = [];
  for (const id of cardIds) {
    const raw = map.get(id);
    if (!raw) continue;
    const grid = toRowMajorNumbers(raw);
    if (grid.length === 5) grids.push(grid);
  }
  return grids;
}

function calledGivesBingo(grid: number[][], called: number[]): boolean {
  return hasBingo(grid, withFreeSpaceCalled(called)) != null;
}

function anyGridBingo(grids: number[][][], called: number[]): boolean {
  return grids.some((g) => calledGivesBingo(g, called));
}

function rangeInclusive(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) out.push(n);
  return out;
}

/** Walk the call list: winner must complete, and no opponent card may complete on or before that call. */
function sequenceLetsWinnerBingoFirst(
  sequence: number[],
  winnerGrid: number[][],
  opponentGrids: number[][][]
): boolean {
  const called: number[] = [];
  for (const n of sequence) {
    called.push(n);
    const opponentHit = anyGridBingo(opponentGrids, called);
    const winnerHit = calledGivesBingo(winnerGrid, called);
    if (opponentHit) return false;
    if (winnerHit) return true;
  }
  return false;
}

function linePatternsOnCard(grid: number[][]): number[][] {
  return [
    grid[0],
    grid[1],
    grid[2],
    grid[3],
    grid[4],
    [grid[0][0], grid[1][0], grid[2][0], grid[3][0], grid[4][0]],
    [grid[0][1], grid[1][1], grid[2][1], grid[3][1], grid[4][1]],
    [grid[0][2], grid[1][2], grid[2][2], grid[3][2], grid[4][2]],
    [grid[0][3], grid[1][3], grid[2][3], grid[3][3], grid[4][3]],
    [grid[0][4], grid[1][4], grid[2][4], grid[3][4], grid[4][4]],
    [grid[0][0], grid[1][1], grid[2][2], grid[3][3], grid[4][4]],
    [grid[0][4], grid[1][3], grid[2][2], grid[3][1], grid[4][0]],
  ];
}

function tryRiggedSequenceForPattern(
  winnerGrid: number[][],
  patternNumbers: number[],
  opponentGrids: number[][][],
  targetCallCount: number
): number[] | null {
  const finals = shuffleArray(patternNumbers);
  for (const finalNumber of finals) {
    const earlyNumbers = patternNumbers.filter((n) => n !== finalNumber);
    const reserved = new Set(patternNumbers);
    const fillerPool = shuffleArray(
      Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !reserved.has(n))
    );
    const prefixCount = targetCallCount - 1;
    if (earlyNumbers.length > prefixCount) continue;

    const prefix: number[] = [];
    const needed = new Set(earlyNumbers);
    let fillerIdx = 0;

    const canAdd = (n: number) => {
      if (prefix.includes(n)) return false;
      const next = [...prefix, n];
      if (anyGridBingo(opponentGrids, next)) return false;
      return true;
    };

    while (prefix.length < prefixCount) {
      const remainingSlots = prefixCount - prefix.length;
      const stillNeed = [...needed].filter((n) => !prefix.includes(n));
      if (stillNeed.length > remainingSlots) break;

      let added = false;
      const mustTakeNeeded = stillNeed.length === remainingSlots;
      const candidates = mustTakeNeeded
        ? shuffleArray(stillNeed)
        : shuffleArray([
            ...stillNeed,
            ...fillerPool.slice(fillerIdx, fillerIdx + 25).filter((n) => !prefix.includes(n)),
          ]);

      for (const n of candidates) {
        if (!canAdd(n)) continue;
        prefix.push(n);
        if (needed.has(n)) needed.delete(n);
        added = true;
        break;
      }

      if (!added) {
        if (mustTakeNeeded) break;
        while (fillerIdx < fillerPool.length) {
          const n = fillerPool[fillerIdx++];
          if (!canAdd(n)) continue;
          prefix.push(n);
          added = true;
          break;
        }
      }
      if (!added) break;
    }

    if (prefix.length !== prefixCount) continue;
    if ([...needed].some((n) => !prefix.includes(n))) continue;

    const withWin = [...prefix, finalNumber];
    if (!calledGivesBingo(winnerGrid, withWin)) continue;
    if (anyGridBingo(opponentGrids, withWin)) continue;

    const suffix = fillerPool.filter((n) => !prefix.includes(n) && n !== finalNumber);
    const sequence = [...prefix, finalNumber, ...suffix];
    if (!sequenceLetsWinnerBingoFirst(sequence, winnerGrid, opponentGrids)) continue;
    return sequence;
  }
  return null;
}

async function generateRiggedNumbersForPlayers(
  selected: SelectedPlayer[],
  side: "bot" | "human",
  callMin = RIGGED_WIN_CALL_MIN,
  callMax = RIGGED_WIN_CALL_MAX
): Promise<number[] | null> {
  const pool = selected.filter((p) => {
    const isBot = p.user.startsWith(BOT_USER_PREFIX);
    return (side === "bot" ? isBot : !isBot) && Array.isArray(p.card) && p.card.length > 0;
  });
  if (pool.length === 0) return null;

  const opponentIds = selected
    .filter((p) => {
      const isBot = p.user.startsWith(BOT_USER_PREFIX);
      return (side === "bot" ? !isBot : isBot) && Array.isArray(p.card) && p.card.length > 0;
    })
    .flatMap((p) => p.card);

  try {
    const opponentGrids = await loadRowMajorGrids(opponentIds);
    const callCounts = shuffleArray(rangeInclusive(callMin, callMax));
    const shuffledPool = shuffleArray(pool);

    for (const player of shuffledPool) {
      const cardIds = shuffleArray(player.card);
      for (const cardId of cardIds) {
        const cardMap = await getCardNumbers([cardId]);
        const rawGrid = cardMap.get(cardId);
        if (!rawGrid) continue;
        const grid = toRowMajorNumbers(rawGrid);
        if (grid.length !== 5) continue;

        const patterns = shuffleArray(
          linePatternsOnCard(grid)
            .map((line) => line.filter((n) => typeof n === "number" && n > 0))
            .filter((nums) => nums.length > 0)
        );

        for (const patternNumbers of patterns) {
          for (const targetCallCount of callCounts) {
            const sequence = tryRiggedSequenceForPattern(
              grid,
              patternNumbers,
              opponentGrids,
              targetCallCount
            );
            if (!sequence) continue;
            console.log(
              `[bot-win-%] ${side} card completes first at call #${targetCallCount} ` +
              `(${player.user} card ${cardId})`
            );
            return sequence;
          }
        }
      }
    }
    return null;
  } catch (err) {
    console.error("[generateRiggedNumbersForPlayers] error:", err);
    return null;
  }
}

/** T=30: Deduct wallets, create game, all DB operations during T30-T35. openGameForPlay at T=35. */
async function prepareGameAndDeduct(io: SocketServer, stake: number): Promise<void> {
  const inFlight = prepareGameInFlight.get(stake);
  if (inFlight) {
    await inFlight.catch(() => { });
    return;
  }

  const job = prepareGameAndDeductLocked(io, stake);
  prepareGameInFlight.set(stake, job);
  try {
    await job;
  } finally {
    if (prepareGameInFlight.get(stake) === job) {
      prepareGameInFlight.delete(stake);
    }
  }
}

async function prepareGameAndDeductLocked(io: SocketServer, stake: number): Promise<void> {
  await withPrepareLock(stake, async () => {
    const liveRound = await getLiveStakeRoundGameId(stake);
    if (liveRound) return;

    cancelBotJoinSchedule(stake);
    await syncBotsToRealPlayers(io, stake, { fillRemaining: true });
    clearBotRoundTarget(stake);

    const startTime = Date.now();
    let gameId: string | null = null;

    try {
      const rpForNames = await prisma.randomPlayer.findFirst({ where: { stake }, orderBy: { id: "asc" } });
      const botNames = botNamesFromRp(rpForNames);
      const selectedRaw = await getSelectedPlayers(stake);
      const selected = selectedRaw.map((p) =>
        p.user.startsWith(BOT_USER_PREFIX) ? ensureBotIdentity(p, botNames) : p
      );
      if (selected.length < 2) {
        io.to(roomName(stake)).emit("timer_reset", {
          message: "Waiting for more players to join...",
          reason: "insufficient_players",
        });
        await setNextGameStart(stake, null);
        setImmediate(() => {
          void tryStartGame(io, stake);
        });
        return;
      }

      const playerCard: Record<string, number[]> = {};
      selected.forEach((p) => {
        playerCard[p.user] = p.card;
      });
      const totalCards = selected.reduce((s, p) => s + p.card.length, 0);
      let favoredSide = await pickFavoredSide(selected);
      let randomNumbers = shuffleNumbers();
      if (favoredSide === "bot" || favoredSide === "human") {
        let rigged = await generateRiggedNumbersForPlayers(selected, favoredSide);
        if (!rigged) {
          rigged = await generateRiggedNumbersForPlayers(
            selected,
            favoredSide,
            RIGGED_WIN_CALL_MAX + 1,
            RIGGED_WIN_CALL_FALLBACK_MAX
          );
        }
        if (rigged && rigged.length > 0) {
          randomNumbers = rigged;
        } else {
          console.warn(`[bot-win-%] could not keep ${favoredSide} ahead of the other side, playing natural odds`);
          favoredSide = "none";
        }
      }
      const playerMeta = buildPlayerMetaFromSelected(selected);

      const game = await prisma.game.create({
        data: {
          stake,
          status: "playing",
          startedAt: new Date(),
          playerCard: playerCard as object,
          randomNumbers: randomNumbers as object,
          playerMeta: Object.keys(playerMeta).length > 0 ? (playerMeta as object) : undefined,
          winnerPrice: 0,
          adminCut: 0,
          jackpotDeductedFromAdminCut: 0,
          jackpotAwarded: 0,
          xScenario: null,
          xBonusPercent: 0,
          xDeductedFromAdminCut: 0,
          xAwarded: 0,
          xCallCount: null,
          bonus: 0,
        },
      });
      gameId = game.id;

      await setCurrentGameId(stake, game.id);
      await setGameState(game.id, "is_running", true);
      await setGameState(game.id, "bingo", false);
      await setGameState(game.id, "called_numbers", []);
      await setGameState(game.id, "favored_side", favoredSide);
      console.log(`[bot-win-%] game ${game.id} stake=${stake} favored=${favoredSide}`);
      const initialParticipations = selected
        .filter(p => !p.user.startsWith(BOT_USER_PREFIX))
        .map(p => ({
          user_id: p.user,
          is_winner: false,
          amount_won: 0,
          times_played: p.card.length
        }));

      if (initialParticipations.length > 0) {
        publishToQueue(QUEUES.GAME_PARTICIPATION, {
          game_id: game.id,
          participations: initialParticipations,
        }).catch((err) => console.error("[prepareGameAndDeduct] publishToQueue:", err));
        void upsertHumanParticipations(game.id, initialParticipations).catch((err) =>
          console.error("[prepareGameAndDeduct] upsertHumanParticipations:", err)
        );
      }

      const botInitialParticipations = selected
        .filter((p) => p.user.startsWith(BOT_USER_PREFIX) && p.displayName && p.playerCode)
        .map((p) => ({
          player_code: p.playerCode!,
          display_name: p.displayName!,
          is_winner: false,
          amount_won: 0,
          times_played: p.card.length,
        }));

      if (botInitialParticipations.length > 0) {
        publishToQueue(QUEUES.GAME_PARTICIPATION, {
          game_id: game.id,
          bot_participations: botInitialParticipations,
        }).catch((err) => console.error("[prepareGameAndDeduct] publishToQueue bots:", err));
        void upsertBotParticipations(game.id, botInitialParticipations).catch((err) =>
          console.error("[prepareGameAndDeduct] upsertBotParticipations:", err)
        );
      }

      const stakeAmount = stake;
      const winnerPrice = calculateWinnerPrice(stakeAmount, totalCards);
      /** Gross admin cut before jackpot: total stakes − winner pool */
      const grossAdminCut = (stakeAmount * totalCards) - winnerPrice;
      /** 2% of gross admin cut — stored on the game as `jackpot_deducted_from_admin_cut`, added to stake jackpot pool */
      const jackpotDeductedFromAdminCut = grossAdminCut > 0 ? grossAdminCut * 0.02 : 0;
      /** Net admin cut after removing the 2% jackpot slice — stored as `adminCut` */
      const adminCutAfterJackpot = grossAdminCut - jackpotDeductedFromAdminCut;
      const humanCardCount = selected
        .filter((p) => !p.user.startsWith(BOT_USER_PREFIX))
        .reduce((s, p) => s + p.card.length, 0);
      const botCardCount = totalCards - humanCardCount;

      const rp = await prisma.randomPlayer.findFirst({ where: { stake } });
      let totalBotCost = 0;

      for (const entry of selected) {
        const userId = entry.user;
        const cost = stake * entry.card.length;

        if (userId.startsWith(BOT_USER_PREFIX)) {
          totalBotCost += cost;
        } else {
          const user = await getCustomAuthUserById(userId);
          if (!user) continue;
          let remain = cost;
          let walletDeducted = 0;
          let bonusDeducted = 0;
          if (user.wallet >= remain) {
            walletDeducted = remain;
            remain = 0;
          } else {
            walletDeducted = Math.max(0, user.wallet);
            remain -= walletDeducted;
          }
          if (remain > 0) {
            bonusDeducted = Math.min(Math.max(0, user.bonus), remain);
          }
          await incrementCustomAuthUserWalletBonus(userId, {
            wallet: -walletDeducted,
            bonus: -bonusDeducted,
          });
          await recordChargeInTx(prisma, {
            gameId: game.id,
            userId,
            amount: cost,
            walletPart: walletDeducted,
            bonusPart: bonusDeducted,
            kind: "stake_game",
          });
          await writeLedgerInTx(prisma, {
            userId,
            delta: -cost,
            kind: "stake_entry",
            refType: "game",
            refId: game.id,
          });
        }
      }

      if (rp && totalBotCost > 0) {
        await debitBotWalletInTx(prisma, rp.id, totalBotCost);
        await recordChargeInTx(prisma, {
          gameId: game.id,
          userId: `${BOT_USER_PREFIX}pool`,
          amount: totalBotCost,
          walletPart: totalBotCost,
          bonusPart: 0,
          kind: "stake_game_bots",
        });
      }

      // Jackpot accounting per stake:
      // - `jackpotDeductedFromAdminCut` = 2% of gross admin cut (stored on Game row + added to pool).
      // - When pool >= configured `jackpot_limit`: award exactly `jackpot_limit` on this game, then reset pool to 0 (no remainder carried).
      const jackpotRow = await prisma.jackpot.findUnique({ where: { stake } });
      const currentJackpotAmount = jackpotRow?.amount ?? 0;
      const jackpotLimit = jackpotRow?.jackpot_limit ?? 0;
      let nextJackpotAmount = currentJackpotAmount + jackpotDeductedFromAdminCut;
      let jackpotAwarded = 0;

      if (jackpotLimit > 0 && nextJackpotAmount >= jackpotLimit) {
        jackpotAwarded = jackpotLimit;
        await setGameState(game.id, "jackpot_pool_before", nextJackpotAmount);
        await setGameState(game.id, "jackpot_limit_snapshot", jackpotLimit);
        nextJackpotAmount = 0;
      }

      if (jackpotRow) {
        await prisma.jackpot.update({
          where: { stake },
          data: { amount: nextJackpotAmount },
        });
      } else {
        await prisma.jackpot.create({
          data: {
            stake,
            amount: nextJackpotAmount,
            jackpot_limit: jackpotLimit,
          },
        });
      }

      await updateGameFinancialsAfterPrepare(
        game.id,
        winnerPrice,
        adminCutAfterJackpot,
        jackpotDeductedFromAdminCut,
        jackpotAwarded,
        humanCardCount,
        botCardCount
      );

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, INITIAL_DELAY_MS - elapsed);
      const gameNumber = game.gameNumber != null ? Number(game.gameNumber) : undefined;
      setTimeout(() => {
        void openGameForPlay(io, stake, game.id, gameNumber, randomNumbers, selected);
      }, remaining);
    } catch (err) {
      console.error("[prepareGameAndDeduct] error:", err);
      if (gameId) await failGameAndClearStake(stake, gameId);
      io.to(roomName(stake)).emit("timer_reset", {
        message: "Could not start game. Please try again.",
        reason: "prepare_failed",
      });
      await setNextGameStart(stake, null);
    }
  });
}

/** T=35: Emit game_started, let users play, start number loop immediately. */
async function openGameForPlay(
  io: SocketServer,
  stake: number,
  gameId: string,
  gameNumber: number | undefined,
  randomNumbers: number[],
  selected: { user: string; card: number[] }[]
): Promise<void> {
  io.to(roomName(stake)).emit("game_started", {
    game_id: gameId,
    game_number: gameNumber,
    player_list: withPlayerListBotFlag(selected),
    stake,
  });

  await clearAllLobbySelections(stake);
  await setNextGameStart(stake, null);
  await emitRoomGameStat(io, stake, []);
  io.to(roomName(stake)).emit("lobby_reset", { reason: "game_started" });

  io.to(roomName(stake)).emit("playing", {
    game_id: gameId,
    message: "Game is now playing",
  });

  void runNumberLoop(io, stake, gameId, randomNumbers);
}

async function runNumberLoop(
  io: SocketServer,
  stake: number,
  gameId: string,
  randomNumbers: number[],
  initialCalled: number[] = [],
  options: { resume?: boolean } = {}
): Promise<void> {
  if (activeNumberLoops.has(gameId)) {
    console.warn(`[runNumberLoop] already active for ${gameId}, skipping duplicate start`);
    return;
  }
  activeNumberLoops.add(gameId);

  try {
    const called: number[] = [...initialCalled];
    const calledSet = new Set<number>();
    calledSet.add(0);
    for (const n of called) {
      if (typeof n === "number" && n > 0) calledSet.add(n);
    }

    if (options.resume && called.length > 0) {
      await setGameState(gameId, "called_numbers", called);
    }

    const skipFirstDelay = options.resume === true;

    if (!skipFirstDelay) {
      await new Promise((r) => setTimeout(r, FIRST_NUMBER_DELAY_MS));
    }

    for (const num of randomNumbers) {
      if (calledSet.has(num)) continue; // Skip duplicates / already drawn

      const isRunning = await getGameState(gameId, "is_running");
      const bingo = await getGameState(gameId, "bingo");
      const claimWindow = await isGameInClaimWindow(gameId);
      if (!isRunning || bingo || claimWindow) break;

      called.push(num);
      calledSet.add(num);
      await setGameState(gameId, "called_numbers", called);
      // Called numbers live in Redis during play — one DB write at game end (not every 5s).

      io.to(roomName(stake)).emit("random_number", {
        random_number: num,
        game_id: gameId,
      });

      const favoredSide = await getGameState(gameId, "favored_side");
      if (favoredSide === "human") {
        const allHits = await checkBingoForAllPlayers(gameId, stake, called, calledSet);
        const humanHits = allHits.filter(
          (w) => w.user_id && !w.user_id.startsWith(BOT_USER_PREFIX)
        );
        if (humanHits.length > 0) {
          const gameRow = await prisma.game.findUnique({
            where: { id: gameId },
            select: { winnerPrice: true, playerCard: true, jackpotAwarded: true, adminCut: true },
          });
          if (gameRow?.playerCard) {
            await enqueueBingoClaim(gameId, async () => {
              const snapshot = {
                winnerPrice: gameRow.winnerPrice ?? 0,
                stake,
                playerCard: gameRow.playerCard as Record<string, number[]>,
                adminCut: gameRow.adminCut ?? 0,
                jackpotAwarded: gameRow.jackpotAwarded ?? 0,
              };
              for (const human of humanHits) {
                await persistClaimWinner(io, stake, gameId, called, human, snapshot);
              }
              const winners = await loadClaimWinners(gameId);
              io.to(roomName(stake)).emit("bingo_claimed", {
                game_id: gameId,
                winners_count: winners.length,
                winners: winners.map((w) => ({ user_id: w.user_id, card_id: w.card_id })),
              });
            });
          }
          break;
        }
      } else {
        const botResult = await checkBingoForRandomPlayers(gameId, stake, called, calledSet);
        if (botResult) {
          await enqueueBingoClaim(gameId, async () => {
            await handleBotBingoClaim(io, stake, gameId, called, botResult);
          });
          break;
        }
      }

      await new Promise((r) => setTimeout(r, NUMBER_INTERVAL_MS));
    }

    const bingoResolved = (await getGameState(gameId, "bingo")) === true;
    const claimWindow = await isGameInClaimWindow(gameId);
    if (bingoResolved || claimWindow) {
      await setGameState(gameId, "is_running", false);
      await maybeFinalizeExpiredClaim(io, gameId);
      return;
    }

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, playerCard: true, playerMeta: true },
    });
    if (game && game.status === "playing") {
      if ((await getGameState(gameId, "bingo")) === true || (await isGameInClaimWindow(gameId))) {
        await setGameState(gameId, "is_running", false);
        return;
      }
      const closedNoWinner = await withDbRetry(() =>
        prisma.game.updateMany({
          where: { id: gameId, status: "playing" },
          data: { status: "closed", calledNumbers: called },
        })
      );
      if (closedNoWinner.count === 0) {
        await setGameState(gameId, "is_running", false);
        return;
      }

      const playerCard = (game.playerCard as Record<string, number[]>) || {};
      const playerMeta =
        (game.playerMeta as Record<string, { displayName?: string; playerCode?: string }> | null) ?? {};
      const rpForNames = await prisma.randomPlayer.findFirst({ where: { stake }, orderBy: { id: "asc" } });
      const botNames = botNamesFromRp(rpForNames);

      const humanFinal = Object.keys(playerCard)
        .filter((uid) => !uid.startsWith(BOT_USER_PREFIX))
        .map((uid) => ({
          user_id: uid,
          is_winner: false,
          amount_won: 0,
          times_played: (playerCard[uid] || []).length,
        }));
      const botFinal = Object.keys(playerCard)
        .filter((uid) => uid.startsWith(BOT_USER_PREFIX))
        .map((uid) => ({
          player_code: playerMeta[uid]?.playerCode ?? botPlayerCode(uid),
          display_name: playerMeta[uid]?.displayName ?? botDisplayName(uid, botNames),
          is_winner: false,
          amount_won: 0,
          times_played: (playerCard[uid] || []).length,
        }));

      if (humanFinal.length > 0) {
        void upsertHumanParticipations(gameId, humanFinal).catch((err) =>
          console.error("[runNumberLoop] upsertHumanParticipations:", err)
        );
      }
      if (botFinal.length > 0) {
        void upsertBotParticipations(gameId, botFinal).catch((err) =>
          console.error("[runNumberLoop] upsertBotParticipations:", err)
        );
      }
    }
    await setGameState(gameId, "is_running", false);
    await setCurrentGameId(stake, null);
    await tryStartGame(io, stake);
  } catch (err) {
    console.error(`[runNumberLoop] ${gameId}`, err);
    await failGameAndClearStake(stake, gameId);
  } finally {
    activeNumberLoops.delete(gameId);
  }
}

async function checkBingoForAllPlayers(
  gameId: string,
  stake: number,
  called: number[],
  calledSet: Set<number>
): Promise<{ user_id: string; card_id: number; numbers: number[][]; winning_numbers: number[]; displayName?: string }[]> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { playerCard: true, playerMeta: true },
  });
  if (!game?.playerCard) return [];
  const playerCard = game.playerCard as Record<string, number[]>;
  const playerMeta = (game.playerMeta as Record<string, { displayName?: string }> | null) ?? {};
  const allCardIds: number[] = [];
  const uidByCardId = new Map<number, string>();
  for (const [uid, cardIds] of Object.entries(playerCard)) {
    for (const cid of cardIds) {
      allCardIds.push(cid);
      uidByCardId.set(cid, uid);
    }
  }
  if (allCardIds.length === 0) return [];

  const cards = await prisma.gameCard.findMany({
    where: { id: { in: allCardIds.map((id) => BigInt(id)) } },
    select: { id: true, numbers: true },
  });
  const rp = await prisma.randomPlayer.findFirst({ where: { stake } });
  const names = (rp && Array.isArray(rp.names) ? rp.names : []) as string[];

  const winners: { user_id: string; card_id: number; numbers: number[][]; winning_numbers: number[]; displayName?: string }[] = [];
  const seenUsers = new Set<string>();

  for (const card of cards) {
    if (!card?.numbers) continue;
    const nums = toRowMajorNumbers(card.numbers);
    if (nums.length !== 5) continue;
    const win = hasBingo(nums, Array.from(calledSet));
    if (win) {
      const cid = Number(card.id);
      const uid = uidByCardId.get(cid) ?? "";
      if (seenUsers.has(uid)) continue;
      seenUsers.add(uid);
      const displayName = uid.startsWith(BOT_USER_PREFIX)
        ? botNameFromMeta(uid, playerMeta, names)
        : undefined;
      winners.push({ user_id: uid, card_id: cid, numbers: nums, winning_numbers: win, displayName });
    }
  }
  return winners;
}

async function checkBingoForRandomPlayers(
  gameId: string,
  stake: number,
  called: number[],
  calledSet: Set<number>
): Promise<{
  winner: { user_id: string; card_id: number; numbers: number[][]; winning_numbers?: number[]; displayName?: string };
  game: {
    winnerPrice: number;
    playerCard: Record<string, number[]>;
    jackpotAwarded: number;
    adminCut: number;
  };
} | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { playerCard: true, playerMeta: true, status: true, winnerPrice: true, jackpotAwarded: true, adminCut: true },
  });
  if (!game?.playerCard || game.status !== "playing") return null;
  const bingo = await getGameState(gameId, "bingo");
  if (bingo) return null;

  const playerCard = game.playerCard as Record<string, number[]>;
  const playerMeta = (game.playerMeta as Record<string, { displayName?: string }> | null) ?? {};
  const botCardIds: number[] = [];
  const uidByCardId = new Map<number, string>();
  for (const [uid, cardIds] of Object.entries(playerCard)) {
    if (!uid.startsWith(BOT_USER_PREFIX)) continue;
    for (const cardId of cardIds) {
      botCardIds.push(cardId);
      uidByCardId.set(cardId, uid);
    }
  }
  if (botCardIds.length === 0) return null;

  const cards = await prisma.gameCard.findMany({
    where: { id: { in: botCardIds.map((id) => BigInt(id)) } },
    select: { id: true, numbers: true },
  });
  const rp = await prisma.randomPlayer.findFirst({ where: { stake } });
  const names = (rp && Array.isArray(rp.names) ? rp.names : []) as string[];

  for (const card of cards) {
    if (!card?.numbers) continue;
    const nums = toRowMajorNumbers(card.numbers);
    if (nums.length !== 5) continue;
    const win = hasBingo(nums, Array.from(calledSet));
    if (win) {
      const cid = Number(card.id);
      const uid = uidByCardId.get(cid) ?? "";
      const displayName = botNameFromMeta(uid, playerMeta, names);
      return {
        winner: { user_id: uid, card_id: cid, numbers: nums, winning_numbers: win, displayName },
        game: {
          winnerPrice: game.winnerPrice ?? 0,
          playerCard: playerCard,
          jackpotAwarded: game.jackpotAwarded ?? 0,
          adminCut: game.adminCut ?? 0,
        },
      };
    }
  }
  return null;
}

async function resolveBingo(
  io: SocketServer,
  stake: number,
  gameId: string,
  called: number[],
  winners: { user_id: string; card_id: number; numbers: number[][]; winning_numbers?: number[]; displayName?: string }[],
  game: {
    winnerPrice: number;
    stake: number;
    playerCard: Record<string, number[]>;
    jackpotAwarded?: number;
    adminCut: number;
  }
): Promise<
  Array<{
    user_id: string;
    name: string;
    card_id: number;
    amount_won: number;
    message: string;
    winning_numbers?: number[];
    jackpot_won_total?: number;
    x_bonus_won_total?: number;
    x_scenario?: string;
  }>
> {
  if (!winners.length) {
    throw new Error(`resolveBingo called with no winners for ${gameId}`);
  }
  await setGameState(gameId, "bingo", true);
  const gameMetaRow = await prisma.game.findUnique({
    where: { id: gameId },
    select: { playerMeta: true },
  });
  const playerMeta =
    (gameMetaRow?.playerMeta as Record<string, { displayName?: string; playerCode?: string }> | null) ?? {};
  const rpForNames = await prisma.randomPlayer.findFirst({ where: { stake }, orderBy: { id: "asc" } });
  const botNames = botNamesFromRp(rpForNames);
  const totalCards = Object.values(game.playerCard).reduce((s, arr) => s + arr.length, 0);
  let bonesAmount = 0;
  const hasBonus = await getBonusForStake(stake);
  const bonesMinPlayers = await getBonesMinPlayers(stake);
  if (hasBonus && totalCards >= bonesMinPlayers) {
    const mult = getBonesMultiplier(called.length);
    bonesAmount = stake * mult;
  }
  const bonusAmount = await getBonusAmount(stake);
  const jackpotAwarded = game.jackpotAwarded ?? 0;
  const callCount = called.filter((n) => n !== 0).length;
  const stakeCfg = await (prisma as any).stakeConfig.findUnique({ where: { amount: stake } });

  const x4Enabled = Boolean(stakeCfg?.x4);
  const x6Enabled = Boolean(stakeCfg?.x6);
  const x8Enabled = Boolean(stakeCfg?.x8);
  const x10Enabled = Boolean(stakeCfg?.x10);

  // Priority: x10 > x8 > x6 > x4 (if multiple are enabled and thresholds overlap).
  let xScenario: string | null = null;
  let xPercent = 0;
  if (x10Enabled && callCount >= 10) {
    xScenario = "10x";
    xPercent = 10;
  } else if (x8Enabled && callCount >= 8) {
    xScenario = "8x";
    xPercent = 30;
  } else if (x6Enabled && callCount >= 6) {
    xScenario = "6x";
    xPercent = 40;
  } else if (x4Enabled && callCount <= 4) {
    xScenario = "4x";
    xPercent = 50;
  }

  const adminCut = Number(game.adminCut ?? 0);
  const xAwarded = xPercent > 0 ? Math.round((adminCut * (xPercent / 100)) * 100) / 100 : 0;

  const totalWin = game.winnerPrice + bonesAmount + bonusAmount + jackpotAwarded + xAwarded;
  const split = winners.length > 0 ? totalWin / winners.length : 0;

  const result: Array<{
    user_id: string;
    name: string;
    card_id: number;
    amount_won: number;
    message: string;
    winning_numbers?: number[];
    card?: number[][];
    bones_won?: number;
    jackpot_won_total?: number;
    x_bonus_won_total?: number;
    x_scenario?: string;
  }> = [];
  const winnerIds: string[] = [];

  for (const w of winners) {
    winnerIds.push(w.user_id);
    const isBot = w.user_id.startsWith(BOT_USER_PREFIX);
    const name =
      w.displayName ??
      (isBot ? botNameFromMeta(w.user_id, playerMeta, botNames) : null) ??
      (await getCustomAuthUserById(w.user_id))?.name ??
      `User ${w.user_id.slice(0, 8)}`;
    const amount = Math.round(split * 100) / 100;
    result.push({
      user_id: w.user_id,
      name,
      card_id: w.card_id,
      card: w.numbers,
      amount_won: amount,
      bones_won: Math.round((bonesAmount / Math.max(1, winners.length)) * 100) / 100,
      jackpot_won_total: Math.round(jackpotAwarded * 100) / 100,
      x_bonus_won_total: Math.round(xAwarded * 100) / 100,
      x_scenario: xScenario ?? undefined,
      message: "Bingo",
      winning_numbers: w.winning_numbers,
    });
  }

  for (const uid of Object.keys(game.playerCard)) {
    if (uid.startsWith(BOT_USER_PREFIX) || winnerIds.includes(uid)) continue;
    const user = await getCustomAuthUserById(uid);
    if (!user) continue;
    const losses = user.consecutive_losses + 1;
    const bonus = user.bonus;
    // if (losses >= 10) {
    //   await updateCustomAuthUserConsecutiveLosses(uid, { consecutive_losses: 0, bonus: bonus + 10 });
    // } else {
    //   await updateCustomAuthUserConsecutiveLosses(uid, { consecutive_losses: losses });
    // }
  }

  // for (const uid of winnerIds) {
  //   if (uid.startsWith(BOT_USER_PREFIX)) continue;
  //   await resetCustomAuthUserConsecutiveLosses(uid);
  // }

  const finalAdminCut = Math.max(0, Math.round((adminCut - xAwarded) * 100) / 100);
  const playerCardObj = (game.playerCard as Record<string, number[]>) || {};
  const { humanCards, botCards } = countCardsByType(playerCardObj);
  const { humanAdminCut, botAdminCut } = splitAdminCutByCards(humanCards, botCards, finalAdminCut);

  const closed = await withDbRetry(() =>
    prisma.game.updateMany({
      where: { id: gameId, status: "playing" },
      data: {
        status: "closed",
        calledNumbers: called,
        winner: winnerIds as object,
        winnerNames: result.map((r) => r.name ?? "Guest").filter(Boolean),
        winnerCards: result.map((r) => r.card_id).filter((id): id is number => typeof id === "number"),
        winnerPrice: result.reduce((acc, r) => acc + (r.amount_won || 0), 0),
        adminCut: finalAdminCut,
        humanAdminCut,
        botAdminCut,
        bonus: bonesAmount + bonusAmount,
        xScenario: xScenario ?? null,
        xBonusPercent: xPercent,
        xDeductedFromAdminCut: xAwarded,
        xAwarded: xAwarded,
        xCallCount: callCount,
      },
    })
  );

  if (closed.count === 0) {
    console.warn(`[BINGO] skip payout for ${gameId} — game already closed`);
    const existing = (await getGameState(gameId, "result_payload")) as typeof result | null;
    return Array.isArray(existing) && existing.length > 0 ? existing : result;
  }

  await setStakeStartHold(game.stake, 6000);

  for (const row of result) {
    const paidKey = `bingo:paid:${gameId}:${row.user_id}`;
    const paidToken = await tryClaim(paidKey, 24 * 60 * 60 * 1000);
    if (!paidToken) continue;
    const amount = row.amount_won;
    try {
      if (row.user_id.startsWith(BOT_USER_PREFIX)) {
        const rp = await prisma.randomPlayer.findFirst({
          where: { stake: game.stake },
          orderBy: { id: "asc" },
        });
        if (rp) {
          await creditBotWalletInTx(prisma, rp.id, amount);
        }
      } else {
        await incrementCustomAuthUserWalletBonus(row.user_id, {
          wallet: amount,
        });
        await writeLedgerInTx(prisma, {
          userId: row.user_id,
          delta: amount,
          kind: "game_win",
          refType: "game",
          refId: gameId,
        });
      }
    } catch (err) {
      await releaseClaim(paidKey, paidToken);
      throw err;
    }
  }

  if (jackpotAwarded > 0) {
    const poolBeforeRaw = await getGameState(gameId, "jackpot_pool_before");
    const limitRaw = await getGameState(gameId, "jackpot_limit_snapshot");
    const poolBefore =
      typeof poolBeforeRaw === "number" && Number.isFinite(poolBeforeRaw)
        ? poolBeforeRaw
        : jackpotAwarded;
    const jackpotLimitSnap =
      typeof limitRaw === "number" && Number.isFinite(limitRaw) ? limitRaw : jackpotAwarded;

    const gameFinancials = await prisma.game.findUnique({
      where: { id: gameId },
      select: { jackpotDeductedFromAdminCut: true },
    });

    void recordJackpotWin({
      gameId,
      stake,
      jackpotLimit: jackpotLimitSnap,
      poolBefore,
      amountAwarded: jackpotAwarded,
      contributionFromGame: gameFinancials?.jackpotDeductedFromAdminCut ?? 0,
      winnerUserIds: winnerIds,
      winnerNames: result.map((r) => r.name).filter(Boolean),
      winnerCardIds: result.map((r) => r.card_id).filter((id): id is number => typeof id === "number"),
      callCount,
    });
  }

  io.to(roomName(stake)).emit("result", {
    data: result,
    game_id: gameId,
  });

  // Record final results asynchronously (RabbitMQ)
  const finalParticipations = Object.keys(game.playerCard)
    .filter(uid => !uid.startsWith(BOT_USER_PREFIX))
    .map(uid => {
      const isWinner = winnerIds.includes(uid);
      const winResult = result.find(r => r.user_id === uid);
      return {
        user_id: uid,
        is_winner: isWinner,
        amount_won: winResult ? winResult.amount_won : 0,
        times_played: ((game.playerCard as any)[uid] || []).length
      };
    });

  if (finalParticipations.length > 0) {
    publishToQueue(QUEUES.GAME_PARTICIPATION, {
      game_id: gameId,
      participations: finalParticipations
    }).catch(err => console.error("[resolveBingo] publishToQueue results:", err));
    void upsertHumanParticipations(gameId, finalParticipations).catch((err) =>
      console.error("[resolveBingo] upsertHumanParticipations:", err)
    );
  }

  const botFinalParticipations = Object.keys(game.playerCard)
    .filter((uid) => uid.startsWith(BOT_USER_PREFIX))
    .map((uid) => {
      const isWinner = winnerIds.includes(uid);
      const winResult = result.find((r) => r.user_id === uid);
      const meta = playerMeta[uid];
      return {
        player_code: meta?.playerCode ?? botPlayerCode(uid),
        display_name: meta?.displayName ?? botDisplayName(uid, botNames),
        is_winner: isWinner,
        amount_won: winResult ? winResult.amount_won : 0,
        times_played: (game.playerCard[uid] || []).length,
      };
    });

  if (botFinalParticipations.length > 0) {
    publishToQueue(QUEUES.GAME_PARTICIPATION, {
      game_id: gameId,
      bot_participations: botFinalParticipations,
    }).catch((err) => console.error("[resolveBingo] publishToQueue bot results:", err));
    void upsertBotParticipations(gameId, botFinalParticipations).catch((err) =>
      console.error("[resolveBingo] upsertBotParticipations:", err)
    );
  }

  return result;
}
