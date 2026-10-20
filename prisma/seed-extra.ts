// @ts-nocheck - Prisma types not resolved in Next.js build
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const accountsCount = await prisma.depositAccount.count();
    if (accountsCount === 0) {
        await prisma.depositAccount.createMany({
            data: [
                { name: "CBE", account_number: "1000123456789", owner_name: "Apple Bingo Platform" },
                { name: "Abyssinia Bank", account_number: "456789123", owner_name: "Apple Bingo Platform" },
                { name: "Awash Bank", account_number: "01320456123400", owner_name: "Apple Bingo Platform" },
            ],
        });
        console.log("Seeded deposit accounts.");
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
