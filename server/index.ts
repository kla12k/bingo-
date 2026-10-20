import "dotenv/config";
import http from "http";
import { Server as SocketServer } from "socket.io";
import { createApp } from "./app";
import { registerSocketHandlers } from "./socket";
import { registerStakeRoomHandlers, startAutoBotStart, resumeOrphanedNumberLoopsForAllStakes } from "./stake-room";
import { startRabbitConsumer } from "./rabbit-consumer";
import { startStuckGameCron } from "./stuck-game-cron";
import { ensureCardPool } from "./card-pool";
import { getActiveGamesByStake } from "../lib/active-games";
import { verifyAccessToken } from "../lib/custom-auth";
import { startWalletTopupCron } from "./wallet-topup-cron";
import { refreshBotScheduleCache, refreshAllStakeOverrides } from "../lib/bot-schedule";
import { registerWeeklyBingoHandlers, startWeeklyBingoCron, initWeeklyBingoOnBoot } from "./weekly-bingo";

const PORT = Number(process.env.SOCKET_PORT) || 3001;

// Avoid crashing the socket process on transient Prisma / async errors in handlers
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

async function main() {
  // Start stuck-game cron first so it runs even if socket/rabbit/card-pool fail later
  startStuckGameCron();
  startWalletTopupCron();
  await refreshBotScheduleCache();
  await refreshAllStakeOverrides();

  const app = createApp();
  const server = http.createServer(app);
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "http://localhost:3000",
    "http://localhost:4000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:4000",
    "https://gsc2pdln-3000.uks1.devtunnels.ms",
    "https://apple.vamosbingo.com",
    "https://apple-dev.vamosbingo.com",
    "https://apple-backend.vamosbingo.com",
    "https://candy-backend.vamosbingo.com",
    "https://candy.vamosbingo.com",
  ].filter(Boolean);

  const io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, origin ?? true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Require valid JWT for every socket connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== "string") {
      return next(new Error("Authentication required"));
    }
    const userId = verifyAccessToken(token);
    if (!userId) {
      return next(new Error("Invalid or expired token"));
    }
    socket.data.userId = userId;
    next();
  });

  registerSocketHandlers(io);
  registerStakeRoomHandlers(io);
  registerWeeklyBingoHandlers(io);
  startWeeklyBingoCron(io);
  void initWeeklyBingoOnBoot(io);
  startAutoBotStart(io, { delayFirstRunMs: 8000 });

  // RabbitMQ is optional at startup — retry in background so the socket server still listens.
  const rabbitRetryMs = Number(process.env.RABBITMQ_RETRY_DELAY_MS) || 5000;
  const startRabbitConsumerWithRetry = () => {
    startRabbitConsumer(io)
      .then(() => console.log("[rabbit] consumer connected"))
      .catch((err) => {
        console.error(`[rabbit] consumer failed, retrying in ${rabbitRetryMs}ms:`, err);
        setTimeout(startRabbitConsumerWithRetry, rabbitRetryMs);
      });
  };
  startRabbitConsumerWithRetry();

  try {
    await ensureCardPool();
  } catch (err) {
    console.error("[card-pool] ensureCardPool failed (will retry on demand):", err);
  }

  setInterval(() => {
    getActiveGamesByStake()
      .then((data) => io.to("stake_lobby").emit("active_stakes", data))
      .catch((err) => console.error("[stake_lobby] getActiveGamesByStake:", err));
  }, 30000);

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Socket server] listening on http://0.0.0.0:${PORT}`);
    void resumeOrphanedNumberLoopsForAllStakes(io);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
