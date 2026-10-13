-- 任务时间区间：一个任务可以「开始时间 ~ 截止时间」，也可以只留截止时间。
-- sortAt 是派生列（有区间取开始，否则取截止），用于列表排序和「今天」判定，
-- 由服务层在写入任务时维护；这里把已有数据回填成截止时间，保持原有顺序。
ALTER TABLE "Task" ADD COLUMN "startAt" TIMESTAMPTZ(3);
ALTER TABLE "Task" ADD COLUMN "sortAt" TIMESTAMPTZ(3);
ALTER TABLE "Task" ADD COLUMN "remindStartLeadMin" INTEGER NOT NULL DEFAULT 0;

UPDATE "Task" SET "sortAt" = "dueAt" WHERE "sortAt" IS NULL;

-- sortAt 完全由时间字段决定，用触发器兜底，避免绕过服务层写入时出现脏值。
CREATE FUNCTION "Task_sortAt_sync"() RETURNS trigger AS $$
BEGIN
  NEW."sortAt" := COALESCE(NEW."startAt", NEW."dueAt");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Task_sortAt_sync" BEFORE INSERT OR UPDATE OF "startAt", "dueAt" ON "Task"
  FOR EACH ROW EXECUTE FUNCTION "Task_sortAt_sync"();

CREATE INDEX "Task_ownerId_status_sortAt_id_idx" ON "Task"("ownerId", "status", "sortAt", "id");

-- 提醒分成「开始」「截止」两个锚点，区间任务会有两条提醒，唯一键相应加上 slot。
ALTER TABLE "Reminder" ADD COLUMN "slot" TEXT NOT NULL DEFAULT 'end';

DROP INDEX "Reminder_taskId_planVersion_key";
CREATE UNIQUE INDEX "Reminder_taskId_planVersion_slot_key" ON "Reminder"("taskId", "planVersion", "slot");
