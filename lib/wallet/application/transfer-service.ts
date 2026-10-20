import { prisma } from "@/lib/prisma";
import { getCustomAuthUserById } from "@/lib/custom-auth";

export class TransferServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function transferWalletBalance(
  userId: string,
  input: { to_phone?: unknown; amount?: unknown }
) {
  const transferAmount = Number(input.amount);
  if (!input.to_phone || isNaN(transferAmount) || transferAmount <= 0) {
    throw new TransferServiceError(400, "Invalid phone number or amount");
  }

  const sender = await getCustomAuthUserById(userId);
  if (!sender) throw new TransferServiceError(404, "Sender not found");
  if (sender.wallet < transferAmount) {
    throw new TransferServiceError(400, "Insufficient balance");
  }

  const recipient = await prisma.customAuthAbstractuser.findUnique({
    where: { phone_number: String(input.to_phone).trim() },
    include: { user: true },
  });
  if (!recipient) throw new TransferServiceError(404, "Recipient not found");

  const recipientId = String(recipient.id);
  if (recipientId === userId) {
    throw new TransferServiceError(400, "Cannot transfer to yourself");
  }

  await prisma.$transaction([
    prisma.customAuthUser.update({
      where: { abstractuser_ptr_id: BigInt(userId) },
      data: { wallet: { decrement: transferAmount } },
    }),
    prisma.customAuthUser.update({
      where: { abstractuser_ptr_id: BigInt(recipientId) },
      data: { wallet: { increment: transferAmount } },
    }),
    prisma.transfer.create({
      data: {
        fromUserId: userId,
        toUserId: recipientId,
        fromName: sender.name,
        toName: recipient.name,
        amount: transferAmount,
      },
    }),
  ]);

  return { message: "Transfer successful" };
}

export async function getTransferHistory(
  userId: string,
  query: { page?: string | string[]; limit?: string | string[] }
) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Number(query.limit) || 10);
  const skip = (page - 1) * limit;
  const where = { OR: [{ fromUserId: userId }, { toUserId: userId }] };
  const [transfers, total] = await Promise.all([
    prisma.transfer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.transfer.count({ where }),
  ]);

  return {
    transfers: transfers.map((transfer) => ({
      ...transfer,
      created_at: transfer.createdAt,
      direction: transfer.fromUserId === userId ? "Sent" : "Received",
    })),
    total,
  };
}