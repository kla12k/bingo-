import type { Server as SocketServer } from "socket.io";
import amqp from "amqplib";
import { QUEUES } from "../lib/rabbitmq";
import { prisma } from "../lib/prisma";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

export async function startRabbitConsumer(io: SocketServer) {
  const conn = await amqp.connect(RABBITMQ_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUES.NOTIFICATIONS, { durable: true });
  await ch.assertQueue(QUEUES.GAME_PARTICIPATION, { durable: true });

  ch.consume(
    QUEUES.NOTIFICATIONS,
    (msg) => {
      if (!msg) return;
      try {
        const body = JSON.parse(msg.content.toString());
        if (body.room) {
          io.to(body.room).emit(body.event || "notification", body.payload || body);
        }
        ch.ack(msg);
      } catch {
        ch.nack(msg, false, true);
      }
    },
    { noAck: false }
  );

  ch.consume(
    QUEUES.GAME_PARTICIPATION,
    async (msg) => {
      if (!msg) return;
      try {
        const body = JSON.parse(msg.content.toString());
        const { game_id, participations, bot_participations } = body;

        if (game_id && Array.isArray(participations)) {
          for (const p of participations) {
            const { user_id, is_winner, amount_won, times_played } = p;
            if (!user_id || user_id.startsWith("bot_")) continue; // Don't track bots

            const userIdBigInt = BigInt(user_id);

            const existing = await (prisma as any).userGameParticipation.findUnique({
              where: {
                userId_gameId: {
                  userId: userIdBigInt,
                  gameId: game_id,
                },
              },
            });

            const incomingWinner = Boolean(is_winner);
            const keepExistingWin = Boolean(existing?.isWinner) && !incomingWinner;

            await (prisma as any).userGameParticipation.upsert({
              where: {
                userId_gameId: {
                  userId: userIdBigInt,
                  gameId: game_id,
                },
              },
              update: {
                isWinner: keepExistingWin ? true : incomingWinner,
                amountWon: keepExistingWin ? Number(existing.amountWon ?? 0) : amount_won,
                timesPlayed: times_played || 1,
              },
              create: {
                userId: userIdBigInt,
                gameId: game_id,
                isWinner: is_winner,
                amountWon: amount_won,
                timesPlayed: times_played || 1,
              },
            });

            if (!existing) {
              try {
                await (prisma as any).customAuthUser.update({
                  where: { abstractuser_ptr_id: userIdBigInt },
                  data: { no_of_games_played: { increment: 1 } },
                });
              } catch (err) {
                console.error("[GAME_PARTICIPATION] Failed to increment no_of_games_played for user", user_id, err);
              }
            }
          }
        }

        if (game_id && Array.isArray(bot_participations)) {
          for (const p of bot_participations) {
            const { player_code, display_name, is_winner, amount_won, times_played } = p;
            if (!player_code || !display_name) continue;

            await (prisma as any).botGameParticipation.upsert({
              where: {
                playerCode_gameId: {
                  playerCode: String(player_code),
                  gameId: game_id,
                },
              },
              update: {
                displayName: String(display_name),
                isWinner: Boolean(is_winner),
                amountWon: Number(amount_won ?? 0),
                timesPlayed: Number(times_played ?? 1),
              },
              create: {
                playerCode: String(player_code),
                displayName: String(display_name),
                gameId: game_id,
                isWinner: Boolean(is_winner),
                amountWon: Number(amount_won ?? 0),
                timesPlayed: Number(times_played ?? 1),
              },
            });
          }
        }

        ch.ack(msg);
      } catch (err) {
        console.error("[GAME_PARTICIPATION] Consumer error:", err);
        ch.nack(msg, false, true);
      }
    },
    { noAck: false }
  );
}
