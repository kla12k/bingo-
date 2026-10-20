import { Server as SocketServer } from "socket.io";
import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import { publishToQueue, QUEUES } from "../lib/rabbitmq";
const redis = getRedis();

const GAME_PREFIX = "game:";
const TTL = 60 * 60 * 24; // 24h
const BINGO_CLAIM_WINDOW_MS = 1000; // collect simultaneous bingo claims for 1s

function gameKey(gameCode: string) {
  return `${GAME_PREFIX}${gameCode}`;
}

function generateCard(): number[][] {
  const cols = 5;
  const grid: number[][] = [];
  for (let c = 0; c < cols; c++) {
    const min = c * 15 + 1;
    const max = c * 15 + 15;
    const col: number[] = [];
    const used = new Set<number>();
    while (col.length < 5) {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (!used.has(n)) {
        used.add(n);
        col.push(n);
      }
    }
    grid.push(col);
  }
  return Array.from({ length: 5 }, (_, row) => grid.map((col) => col[row]));
}

// per-game pending bingo claims: gameCode -> { timeout, winnerIds: Set<{ playerId, cardId, nickname }> }
const bingoPending = new Map<
  string,
  { timeout: NodeJS.Timeout; winners: Array<{ playerId: string; cardId: string; nickname: string }> }
>();

export function registerSocketHandlers(io: SocketServer) {
  io.on("connection", (socket) => {
    socket.on(
      "join_game",
      async (payload: { gameCode: string; nickname: string; numCards?: number }) => {
        const { gameCode, nickname, numCards = 1 } = payload;
        if (!gameCode || !nickname) {
          socket.emit("error", { message: "gameCode and nickname required" });
          return;
        }
        const code = String(gameCode).toUpperCase().trim();
        let game = await prisma.game.findUnique({
          where: { code },
          include: { players: { include: { cards: true } } },
        });
        if (!game) {
          socket.emit("error", { message: "Game not found" });
          return;
        }
        if (game.status !== "waiting") {
          socket.emit("error", { message: "Game already started or finished" });
          return;
        }
        const nick = nickname.trim().slice(0, 30);
        let player = await prisma.player.findUnique({
          where: { gameId_nickname: { gameId: game.id, nickname: nick } },
          include: { cards: true },
        });
        const cardsToCreate = Math.min(Math.max(1, Number(numCards) || 1), 6);
        if (!player) {
          const totalCards =
          game.players.reduce((s: number, p: { cards: unknown[] }) => s + p.cards.length, 0) +
          cardsToCreate;
          const totalPlayers = game.players.length + 1;
          if (totalPlayers > game.maxPlayers) {
            socket.emit("error", { message: "Game is full" });
            return;
          }
          player = await prisma.player.create({
            data: {
              gameId: game.id,
              nickname: nick,
              socketId: socket.id,
              cards: {
                create: Array.from({ length: cardsToCreate }, () => ({
                  card: generateCard(),
                  marked: [],
                })),
              },
            },
            include: { cards: true },
          });
        } else {
          for (let i = 0; i < cardsToCreate; i++) {
            await prisma.gamePlayerCard.create({
              data: { playerId: player.id, card: generateCard(), marked: [] },
            });
          }
          player = await prisma.player.findUniqueOrThrow({
            where: { id: player.id },
            include: { cards: true },
          });
        }
        await redis.setex(gameKey(code), TTL, JSON.stringify({ gameId: game.id, code }));
        socket.join(`game:${code}`);
        socket.data = { gameCode: code, playerId: player.id, nickname: player.nickname };
        await prisma.player.update({
          where: { id: player.id },
          data: { socketId: socket.id },
        });
        const updated = await prisma.game.findUnique({
          where: { id: game.id },
          include: {
            players: {
              select: {
                id: true,
                nickname: true,
                cards: { select: { id: true, card: true, marked: true } },
              },
            },
          },
        });
        socket.emit("joined", { player, game: updated });
        io.to(`game:${code}`).emit("player_joined", {
          player: { id: player.id, nickname: player.nickname, cards: player.cards },
          game: updated,
        });
        await publishToQueue(QUEUES.GAME_EVENTS, {
          type: "player_joined",
          gameCode: code,
          playerId: player.id,
        });
      }
    );

    socket.on("add_card", async (payload: { gameCode: string; playerId: string }) => {
      const { gameCode, playerId } = payload;
      if (!gameCode || !playerId) {
        socket.emit("error", { message: "gameCode and playerId required" });
        return;
      }
      const code = String(gameCode).toUpperCase();
      const game = await prisma.game.findUnique({
        where: { code },
        include: { players: { include: { cards: true } } },
      });
      if (!game || game.status !== "waiting") {
        socket.emit("error", { message: "Game not found or already started" });
        return;
      }
      const player = await prisma.player.findFirst({
        where: { id: playerId, gameId: game.id },
        include: { cards: true },
      });
      if (!player || player.socketId !== socket.id) {
        socket.emit("error", { message: "Not your player or not in waiting" });
        return;
      }
      if (player.cards.length >= 6) {
        socket.emit("error", { message: "Max 6 cards per player" });
        return;
      }
      const newCard = await prisma.gamePlayerCard.create({
        data: { playerId: player.id, card: generateCard(), marked: [] },
      });
      const updatedPlayer = await prisma.player.findUniqueOrThrow({
        where: { id: player.id },
        include: { cards: true },
      });
      const updated = await prisma.game.findUnique({
        where: { id: game.id },
        include: {
          players: {
            select: {
              id: true,
              nickname: true,
              cards: { select: { id: true, card: true, marked: true } },
            },
          },
        },
      });
      socket.emit("card_added", { card: newCard, game: updated });
      io.to(`game:${code}`).emit("player_cards_updated", {
        playerId: player.id,
        player: updatedPlayer,
        game: updated,
      });
    });

    socket.on("start_game", async (payload: { gameCode: string }) => {
      const code = String(payload?.gameCode || socket.data?.gameCode).toUpperCase();
      if (!code) {
        socket.emit("error", { message: "gameCode required" });
        return;
      }
      const game = await prisma.game.findUnique({
        where: { code },
        include: { players: { include: { cards: true } } },
      });
      if (!game || game.status !== "waiting") {
        socket.emit("error", { message: "Game not found or not in waiting state" });
        return;
      }
      const totalCards = game.players.reduce(
        (s: number, p: { cards: unknown[] }) => s + p.cards.length,
        0
      );
      if (game.players.length < 2 || totalCards < 2) {
        socket.emit("error", { message: "Need at least 2 players and 2 cards to start" });
        return;
      }
      await prisma.game.update({
        where: { id: game.id },
        data: { status: "playing", startedAt: new Date() },
      });
      const called: number[] = [];
      await redis.setex(gameKey(code), TTL, JSON.stringify({ gameId: game.id, code, called }));
      io.to(`game:${code}`).emit("game_started", { called });
      await publishToQueue(QUEUES.GAME_EVENTS, { type: "game_started", gameCode: code });
    });

    socket.on("call_number", async (payload: { gameCode: string }) => {
      const code = String(payload?.gameCode || socket.data?.gameCode).toUpperCase();
      if (!code) return;
      const game = await prisma.game.findFirst({ where: { code } });
      if (!game || game.status !== "playing") return;
      const raw = await redis.get(gameKey(code));
      const data = raw ? (JSON.parse(raw) as { called?: number[] }) : { called: [] };
      const called = (data.called ?? []) as number[];
      let num: number;
      do {
        num = Math.floor(Math.random() * 75) + 1;
      } while (called.includes(num));
      called.push(num);
      await prisma.game.update({
        where: { id: game.id },
        data: { calledNumbers: called },
      });
      await redis.setex(gameKey(code), TTL, JSON.stringify({ ...data, called }));
      io.to(`game:${code}`).emit("number_called", { number: num, called });
      await publishToQueue(QUEUES.GAME_EVENTS, { type: "number_called", gameCode: code, number: num });
    });

    socket.on(
      "mark_number",
      async (payload: { gameCode: string; playerId: string; cardId: string; number: number }) => {
        const { gameCode, playerId, cardId, number } = payload;
        if (!gameCode || !playerId || !cardId || number == null) return;
        const code = String(gameCode).toUpperCase();
        const card = await prisma.gamePlayerCard.findFirst({
          where: { id: cardId, player: { id: playerId, game: { code } } },
        });
        if (!card) return;
        const marked = (card.marked as number[]) || [];
        if (marked.includes(number)) return;
        const updated = [...marked, number];
        await prisma.gamePlayerCard.update({ where: { id: cardId }, data: { marked: updated } });
        socket.to(`game:${code}`).emit("player_marked", {
          playerId,
          cardId,
          number,
          marked: updated,
        });
        socket.emit("player_marked", { playerId, cardId, number, marked: updated });
      }
    );

    socket.on(
      "bingo",
      async (payload: { gameCode: string; playerId: string; cardId: string }) => {
        const { gameCode, playerId, cardId } = payload;
        if (!gameCode || !playerId || !cardId) return;
        const code = String(gameCode).toUpperCase();
        const game = await prisma.game.findFirst({
          where: { code },
          include: { players: { include: { cards: true } } },
        });
        if (!game || game.status !== "playing") return;
        const player = game.players.find((p: { id: string }) => p.id === playerId);
        const card = player?.cards.find((c: { id: string }) => c.id === cardId);
        if (!player || !card) return;
        const existing = bingoPending.get(code);
        const winnerEntry = {
          playerId,
          cardId,
          nickname: player.nickname,
        };
        if (existing) {
          if (existing.winners.some((w) => w.cardId === cardId)) return;
          existing.winners.push(winnerEntry);
          io.to(`game:${code}`).emit("bingo_claimed", {
            winners: existing.winners,
            gameCode: code,
          });
          return;
        }
        const winners: Array<{ playerId: string; cardId: string; nickname: string }> = [
          winnerEntry,
        ];
        bingoPending.set(code, {
          winners,
          timeout: setTimeout(async () => {
            bingoPending.delete(code);
            await prisma.game.update({
              where: { id: game.id },
              data: { status: "finished" },
            });
            io.to(`game:${code}`).emit("bingo_winners", {
              winners,
              gameCode: code,
            });
            await publishToQueue(QUEUES.GAME_EVENTS, {
              type: "bingo_winners",
              gameCode: code,
              winnerIds: winners.map((w) => ({ playerId: w.playerId, cardId: w.cardId })),
            });
          }, BINGO_CLAIM_WINDOW_MS),
        });
        io.to(`game:${code}`).emit("bingo_claimed", {
          winners,
          gameCode: code,
        });
      }
    );

    socket.on("disconnect", async () => {
      const { gameCode, playerId } = socket.data || {};
      if (gameCode && playerId) {
        await prisma.player.updateMany({
          where: { id: playerId },
          data: { socketId: null },
        });
        const game = await prisma.game.findUnique({
          where: { code: gameCode },
          include: { players: true },
        });
        if (game) {
          io.to(`game:${gameCode}`).emit("player_left", { playerId });
        }
      }
    });
  });
}
