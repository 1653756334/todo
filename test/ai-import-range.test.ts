import test from "node:test";
import assert from "node:assert/strict";
import { buildMessages, normalizeCandidates } from "../src/server/ai/provider";

const options = {
  timeZone: "Asia/Shanghai",
  now: new Date("2026-10-13T02:00:00.000Z"),
  projectIds: new Set<string>(["proj-1"]),
};

function only(record: Record<string, unknown>) {
  const [candidate, ...rest] = normalizeCandidates({ tasks: [record] }, options);
  assert.equal(rest.length, 0);
  return candidate;
}

test("原文写明起止时间时提取出时间段", () => {
  const task = only({
    title: "参加面试",
    duePrecision: "datetime",
    startAt: "2026-10-15T14:00:00+08:00",
    dueAt: "2026-10-15T16:00:00+08:00",
    dueHint: "10 月 15 日 14:00-16:00",
  });
  assert.equal(task.startAt, "2026-10-15T06:00:00.000Z");
  assert.equal(task.dueAt, "2026-10-15T08:00:00.000Z");
});

test("不带时区的起止时间按用户时区解释", () => {
  const task = only({
    title: "线上笔试",
    duePrecision: "datetime",
    startAt: "2026-10-15T09:00",
    dueAt: "2026-10-15T11:30",
  });
  assert.equal(task.startAt, "2026-10-15T01:00:00.000Z");
  assert.equal(task.dueAt, "2026-10-15T03:30:00.000Z");
});

test("时间段不可用时退回单点，不产生只有开始时间的任务", () => {
  for (const record of [
    // 开始晚于截止
    { title: "顺序反了", duePrecision: "datetime", startAt: "2026-10-15T18:00:00+08:00", dueAt: "2026-10-15T16:00:00+08:00" },
    // 开始等于截止
    { title: "同一时刻", duePrecision: "datetime", startAt: "2026-10-15T16:00:00+08:00", dueAt: "2026-10-15T16:00:00+08:00" },
    // 无法解析
    { title: "看不懂", duePrecision: "datetime", startAt: "下午两点", dueAt: "2026-10-15T16:00:00+08:00" },
    // 没有截止时间
    { title: "只有开始", duePrecision: "none", startAt: "2026-10-15T14:00:00+08:00" },
    // 只有日期精度
    { title: "只给日期", duePrecision: "date", startAt: "2026-10-15T14:00:00+08:00", dueDate: "2026-10-15" },
  ]) {
    const task = only(record);
    assert.equal(task.startAt, null, `${record.title} 不该保留开始时间`);
    if (record.dueAt) assert.equal(task.dueAt, "2026-10-15T08:00:00.000Z");
    if (record.dueDate) assert.equal(task.dueDate, "2026-10-15");
  }
});

test("缺少 startAt 字段（旧模型输出）仍然可用", () => {
  const task = only({ title: "回忆版", duePrecision: "datetime", dueAt: "2026-10-15T16:00:00+08:00" });
  assert.equal(task.startAt, null);
  assert.equal(task.dueAt, "2026-10-15T08:00:00.000Z");
});

test("解析提示词要求区分时间段并给出 startAt 字段", () => {
  const messages = buildMessages("10 月 15 日 14:00-16:00 面试", {
    now: options.now,
    timeZone: options.timeZone,
    projects: [{ id: "proj-1", name: "秋招" }],
  });
  const system = String(messages[0].content);
  assert.match(system, /startAt/);
  assert.match(system, /一段起止时间/);
  assert.match(system, /startAt 必须早于 dueAt/);
});
