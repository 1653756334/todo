CREATE TYPE "TaskPriority" AS ENUM ('high', 'normal', 'low');
ALTER TABLE "Task" DROP CONSTRAINT "Task_priority_valid";
ALTER TABLE "NotificationChannel" DROP CONSTRAINT "Channel_priority_valid";
ALTER TABLE "Task" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "priority" TYPE "TaskPriority" USING "priority"::"TaskPriority";
ALTER TABLE "Task" ALTER COLUMN "priority" SET DEFAULT 'normal';
ALTER TABLE "NotificationChannel" ALTER COLUMN "minPriority" DROP DEFAULT;
ALTER TABLE "NotificationChannel" ALTER COLUMN "minPriority" TYPE "TaskPriority" USING "minPriority"::"TaskPriority";
ALTER TABLE "NotificationChannel" ALTER COLUMN "minPriority" SET DEFAULT 'low';
