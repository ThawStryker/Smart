import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { conversationStates } from "@defs";

export type Phase = "brainstorm" | "plan" | "execute" | "verify";

export async function getPhase(projectId: number): Promise<Phase> {
  const [s] = await db.select().from(conversationStates).where(eq(conversationStates.projectId, projectId));
  return (s?.phase as Phase) || "brainstorm"; // Default to brainstorm for new conversations
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
  return /^[好可以行对嗯okyes]/.test(msg) || /确认/.test(msg) || /没问题/.test(msg) || /开始/.test(msg) || /执行/.test(msg) || /同意/.test(msg) || /按.*方案/.test(msg) || /继续/.test(msg) || /做吧/.test(msg) || /搞/.test(msg);
}

function isReject(msg: string): boolean {
  return /不/.test(msg) || /换.*方案/.test(msg) || /重新/.test(msg) || /算了/.test(msg) || /不要/.test(msg);
}

// Light tasks: simple tweaks that don't need a plan
function isLightTask(msg: string): boolean {
  return /改.*颜色|修.*文案|改.*字[号体]|加.*空格|改.*样式|css|typo|拼写错误|改.*标题|换.*图标|调.*间距|改.*大小/.test(msg);
}

// Complex tasks: need a plan document before execution
function isComplexTask(msg: string): boolean {
  return /新功能|重构|架构|新增.*功能|实现.*系统|多文件|跨文件|新建.*项目|设计|实现.*页面|添加.*模块|创建.*系统|重写|改造|复杂|整个/.test(msg);
}

export async function advancePhase(
  projectId: number,
  currentPhase: Phase,
  userMessage: string,
): Promise<Phase> {
  if (currentPhase === "brainstorm") {
    if (isReject(userMessage)) {
      // User wants changes to the proposal — stay in brainstorm
      return "brainstorm";
    }
    if (isConfirm(userMessage)) {
      // User approved the analysis. Now evaluate complexity.
      if (isComplexTask(userMessage)) {
        await setPhase(projectId, "plan");
        return "plan";
      }
      // Simple or medium — go straight to execute
      await setPhase(projectId, "execute");
      return "execute";
    }
    // User is providing more info / discussing — stay in brainstorm
    return "brainstorm";
  }

  if (currentPhase === "plan") {
    if (isReject(userMessage)) return "plan";
    if (isConfirm(userMessage)) {
      await setPhase(projectId, "execute");
      return "execute";
    }
    return "plan";
  }

  // In execute or verify — reset to brainstorm if user asks for something new
  if (currentPhase === "execute" || currentPhase === "verify") {
    if (isComplexTask(userMessage)) {
      await setPhase(projectId, "brainstorm");
      return "brainstorm";
    }
    if (isLightTask(userMessage)) {
      return "execute";
    }
    // For follow-up requests in the same conversation, stay in execute
    return "execute";
  }

  return currentPhase;
}

export function getPhasePromptAddon(phase: Phase): string {
  switch (phase) {
    case "brainstorm":
      return "\n\n---\n**你的任务：先分析用户需求，告诉我你理解的需求是什么、打算怎么做。如果是复杂项目，给出 2-3 种方案并推荐一种。先不要写代码。**";
    case "plan":
      return "\n\n---\n**你的任务：用 Markdown 写一份开发计划，列出每一步要做什么、改哪些文件。让用户确认后再开始。不要写代码。**";
    case "execute":
      return "\n\n---\n**你的任务：按计划或用户需求逐步实施，每步完成后验证。**";
    case "verify":
      return "\n\n---\n**你的任务：验证所有修改是否正确，报告验证结果。**";
  }
}
