-- CreateTable: system working hours (Ethiopian time, HH:mm)
CREATE TABLE IF NOT EXISTS "system_working_time" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "start_time" VARCHAR(5) NOT NULL DEFAULT '11:00',
    "end_time" VARCHAR(5) NOT NULL DEFAULT '23:00',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_working_time_pkey" PRIMARY KEY ("id")
);

INSERT INTO "system_working_time" ("id", "start_time", "end_time", "is_active")
VALUES (1, '11:00', '23:00', true)
ON CONFLICT ("id") DO NOTHING;
