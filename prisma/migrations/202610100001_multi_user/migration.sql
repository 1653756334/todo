-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PENDING', 'DISABLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "accountEmail" TEXT,
    "accountEmailVerifiedAt" TIMESTAMPTZ(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "aiDailyQuotaOverride" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "remindEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindLeadMin" INTEGER NOT NULL DEFAULT 60,
    "notificationVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT,
    "color" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "dueAt" TIMESTAMPTZ(3),
    "projectId" TEXT,
    "remindEnabled" BOOLEAN NOT NULL DEFAULT true,
    "remindLeadMin" INTEGER NOT NULL DEFAULT 60,
    "sourceId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reminderVersion" INTEGER NOT NULL DEFAULT 0,
    "reminderFingerprint" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTag" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "TaskTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT,
    "model" TEXT,
    "commitRequestId" TEXT,
    "committedImportId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orphanedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportImage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "importId" TEXT,
    "draftId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGING',
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "minPriority" TEXT NOT NULL DEFAULT 'low',
    "brief" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "email" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "webhookEncrypted" TEXT,
    "signSecretEncrypted" TEXT,
    "lastTestAt" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL,
    "triggerAt" TIMESTAMPTZ(3) NOT NULL,
    "dueSnapshot" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "lockedAt" TIMESTAMPTZ(3),
    "pushStatus" TEXT,
    "pushAttempt" INTEGER NOT NULL DEFAULT 0,
    "pushSentAt" TIMESTAMPTZ(3),
    "pushError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "channelId" TEXT,
    "channelType" TEXT NOT NULL,
    "labelSnapshot" TEXT NOT NULL,
    "channelRevision" INTEGER NOT NULL,
    "recipientVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "dispatchVersion" INTEGER NOT NULL DEFAULT 1,
    "claimToken" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOutbox" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "dispatchVersion" INTEGER NOT NULL,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "claimToken" TEXT,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDailyBudget" (
    "userId" TEXT NOT NULL,
    "dayUtc" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiDailyBudget_pkey" PRIMARY KEY ("userId","dayUtc")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayUtc" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservationExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "providerConfigRevision" INTEGER NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "tokenCount" INTEGER,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" TEXT,
    "targetEmail" TEXT,
    "channelId" TEXT,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "group" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("group")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "result" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "instanceId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("instanceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_accountEmail_key" ON "User"("accountEmail");

-- CreateIndex
CREATE INDEX "Project_ownerId_archivedAt_idx" ON "Project"("ownerId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_ownerId_id_key" ON "Project"("ownerId", "id");

-- CreateIndex
CREATE INDEX "Task_ownerId_status_dueAt_id_idx" ON "Task"("ownerId", "status", "dueAt", "id");

-- CreateIndex
CREATE INDEX "Task_ownerId_projectId_idx" ON "Task"("ownerId", "projectId");

-- CreateIndex
CREATE INDEX "Task_sourceId_idx" ON "Task"("sourceId");

-- CreateIndex
CREATE INDEX "TaskTag_tag_taskId_idx" ON "TaskTag"("tag", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_taskId_tag_key" ON "TaskTag"("taskId", "tag");

-- CreateIndex
CREATE INDEX "TaskLink_taskId_idx" ON "TaskLink"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportDraft_committedImportId_key" ON "ImportDraft"("committedImportId");

-- CreateIndex
CREATE INDEX "ImportDraft_ownerId_status_expiresAt_idx" ON "ImportDraft"("ownerId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Import_ownerId_createdAt_idx" ON "Import"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Import_ownerId_id_key" ON "Import"("ownerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImportImage_storageKey_key" ON "ImportImage"("storageKey");

-- CreateIndex
CREATE INDEX "ImportImage_importId_idx" ON "ImportImage"("importId");

-- CreateIndex
CREATE INDEX "ImportImage_draftId_idx" ON "ImportImage"("draftId");

-- CreateIndex
CREATE INDEX "ImportImage_status_expiresAt_idx" ON "ImportImage"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "NotificationChannel_ownerId_type_idx" ON "NotificationChannel"("ownerId", "type");

-- CreateIndex
CREATE INDEX "Reminder_status_triggerAt_idx" ON "Reminder"("status", "triggerAt");

-- CreateIndex
CREATE INDEX "Reminder_recipientUserId_triggerAt_idx" ON "Reminder"("recipientUserId", "triggerAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_taskId_planVersion_key" ON "Reminder"("taskId", "planVersion");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_reminderId_channelId_key" ON "NotificationDelivery"("reminderId", "channelId");

-- CreateIndex
CREATE INDEX "JobOutbox_publishedAt_availableAt_idx" ON "JobOutbox"("publishedAt", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobOutbox_kind_targetId_dispatchVersion_key" ON "JobOutbox"("kind", "targetId", "dispatchVersion");

-- CreateIndex
CREATE INDEX "AiCall_status_reservationExpiresAt_idx" ON "AiCall"("status", "reservationExpiresAt");

-- CreateIndex
CREATE INDEX "AiCall_userId_startedAt_idx" ON "AiCall"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_hash_key" ON "AccountToken"("hash");

-- CreateIndex
CREATE INDEX "AccountToken_purpose_expiresAt_idx" ON "AccountToken"("purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_username_createdAt_idx" ON "LoginAttempt"("username", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_projectId_fkey" FOREIGN KEY ("ownerId", "projectId") REFERENCES "Project"("ownerId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_sourceId_fkey" FOREIGN KEY ("ownerId", "sourceId") REFERENCES "Import"("ownerId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTag" ADD CONSTRAINT "TaskTag_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportDraft" ADD CONSTRAINT "ImportDraft_committedImportId_fkey" FOREIGN KEY ("committedImportId") REFERENCES "Import"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportImage" ADD CONSTRAINT "ImportImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportImage" ADD CONSTRAINT "ImportImage_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportImage" ADD CONSTRAINT "ImportImage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ImportDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationChannel" ADD CONSTRAINT "NotificationChannel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDailyBudget" ADD CONSTRAINT "AiDailyBudget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

