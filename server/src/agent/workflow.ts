import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { conversationStates } from "@defs";

export type Phase = "brainstorm" | "plan" | "execute" | "verify";

const HEAVY = [/新功能/, /重构/, /架构/, /新增.*功能/, /实现.*系统/, /多文件/, /跨文件/, /新建.*项目/, /设计/, /实现.*页面/, /添加.*模块/, /创建.*系统/, /重写/, /改造/];
const LIGHT = [/改.*颜色/, /修.*文案/, /改.*字[号体]/, /加.*空格/, /改.*样式/, /css/i, /typo/i, /拼写错误/, /改.*标题/, /换.*图标/, /调.*间距/, /改.*大小/];

export function classifyTask(msg: string): "light" | "medium" | "heavy" {
  if (LIGHT.some(p => p.test(msg))) return "light";
  if (HEAVY.some(p => p.test(msg))) return "heavy";
  return "medium";
}

export async function getPhase(projectId: number): Promise<Phase> {
  const [s] = await db.select().from(conversationStates).where(eq(conversationStates.projectId, projectId));
  return (s?.phase as Phase) || "execute";
}

export async function setPhase(projectId: number, phase: Phase, pendingConfirm = false, contextJson: string | null = null) {
  const [s] = await db.select().from(conversationStates).where(eq(conversationStates.projectId, projectId));
  if (s) {
    await db.update(conversationStates).set({ phase, pendingConfirm, contextJson, updatedAt: new Date().toISOString() }).where(eq(conversationStates.id, s.id));
  } else {
    await db.insert(conversationStates).values({ projectId, phase, pendingConfirm, contextJson });
  }
}

function isConfirm(msg: string): boolean {
  return /^[好可以行对嗯okyes]/.test(msg) || /确认/.test(msg) || /没问题/.test(msg) || /开始/.test(msg) || /执行/.test(msg) || /同意/.test(msg) || /按.*方案/.test(msg);
}

export async function advancePhase(
  projectId: number, currentPhase: Phase, userMessage: string, taskLevel: string,
): Promise<Phase> {
  if (taskLevel === "light" || taskLevel === "medium") {
    await setPhase(projectId, "execute");
    return "execute";
  }

  // Heavy tasks: force phase progression
  if (currentPhase === "execute") {
    await setPhase(projectId, "brainstorm");
    return "brainstorm";
  }
  if (currentPhase === "brainstorm" && isConfirm(userMessage)) {
    await setPhase(projectId, "plan");
    return "plan";
  }
  if (currentPhase === "plan" && isConfirm(userMessage)) {
    await setPhase(projectId, "execute");
    return "execute";
  }
  return currentPhase;
}

export function getPhaseHint(phase: Phase): string | null {
  switch (phase) {
    case "brainstorm": return "\n\n方案已收到。你觉得这个方案可以吗？确认后我会编写详细实施计划。";
    case "plan": return "\n\n计划已编写。确认后开始逐步实施。";
    default: return null;
  }
}
