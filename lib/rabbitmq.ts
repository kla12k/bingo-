import amqp from "amqplib";

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? "amqp://guest:guest@localhost:5672";

let channel: amqp.Channel | null = null;
let connection: any = null;

export const QUEUES = {
  GAME_EVENTS: "bingo.game.events",
  NOTIFICATIONS: "bingo.notifications",
  GAME_PARTICIPATION: "bingo.game.participation",
} as const;

export async function getRabbitChannel(): Promise<amqp.Channel> {
  if (channel && connection) return channel;

  try {
    const conn = await amqp.connect(RABBITMQ_URL);
    conn.on("error", (err) => {
      console.error("[rabbit] connection error:", err.message);
      channel = null;
      connection = null;
    });
    conn.on("close", () => {
      console.log("[rabbit] connection closed");
      channel = null;
      connection = null;
    });

    const ch = await conn.createChannel();
    ch.on("error", (err) => {
      console.error("[rabbit] channel error:", err.message);
      channel = null;
    });
    ch.on("close", () => {
      channel = null;
    });

    await ch.assertQueue(QUEUES.GAME_EVENTS, { durable: true });
    await ch.assertQueue(QUEUES.NOTIFICATIONS, { durable: true });
    await ch.assertQueue(QUEUES.GAME_PARTICIPATION, { durable: true });

    connection = conn;
    channel = ch;
    return ch;
  } catch (err) {
    channel = null;
    connection = null;
    throw err;
  }
}

export async function publishToQueue(queue: string, message: object): Promise<void> {
  try {
    const ch = await getRabbitChannel();
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
  } catch (err) {
    console.error(`[rabbit] publish to ${queue} failed:`, err);
    // Reset connection on publish error so next retry creates a fresh connection
    channel = null;
    connection = null;
  }
}

export async function closeRabbit(): Promise<void> {
  if (channel) await channel.close().catch(() => {});
  if (connection) await connection.close().catch(() => {});
  channel = null;
  connection = null;
}

