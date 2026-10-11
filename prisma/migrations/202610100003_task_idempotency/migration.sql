ALTER TABLE "Task" ADD COLUMN "clientMutationId" TEXT, ADD COLUMN "lastMutationId" TEXT;
CREATE UNIQUE INDEX "Task_ownerId_clientMutationId_key" ON "Task"("ownerId", "clientMutationId");
