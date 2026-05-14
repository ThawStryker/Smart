import { db } from "edgespark";
import { eq } from "drizzle-orm";
import { conversationStates, projects } from "@defs";

export type Phase = "brainstorm" | "plan" | "execute" | "verify";

export interface WorkflowState {
  phase: Phase;
  pendingConfirm: boolean;
  contextJson: string | null;
}

// === Phase determination ===

const HEAVY_PATTERNS = [
  /新功能/, /重构/, /架构/, /新增.*功能/, /实现.*系统/,
  /多文件/, /跨文件/, /新建.*项目/, /设计/, /实现.*页面/,
  /添加.*模块/, /创建.*系统/, /重写/, /改造/,
];

const LIGHT_PATTERNS = [
  /改.*颜色/, /修.*文案/, /改.*字[号体]/, /加.*空格/,
  /改.*样式/, /css/i, /typo/i, /拼写错误/, /改.*标题/,
  /换.*图标/, /调.*间距/, /改.*大小/,
];

export function classifyTask(message: string): { level: "light" | "medium" | "heavy"; reason: string } {
  if (LIGHT_PATTERNS.some(p => p.test(message))) {
    return { level: "light", reason: "样式/文案微调" };
  }
  if (HEAVY_PATTERNS.some(p => p.test(message))) {
    return { level: "heavy", reason: "涉及架构/多文件改动" };
  }
  return { level: "medium", reason: "单文件改动/Bug修复" };
}

// === Phase state machine ===

export async function getWorkflowState(projectId: number): Promise<WorkflowState> {
  const [state] = await db
    .select()
    .from(conversationStates)
    .where(eq(conversationStates.projectId, projectId));

  return state
    ? { phase: state.phase as Phase, pendingConfirm: state.pendingConfirm as boolean, contextJson: state.contextJson }
    : { phase: "execute", pendingConfirm: false, contextJson: null };
}

export async function setWorkflowState(
  projectId: number,
  phase: Phase,
  pendingConfirm = false,
  contextJson: string | null = null,
) {
  const [existing] = await db
    .select()
    .from(conversationStates)
    .where(eq(conversationStates.projectId, projectId));

  if (existing) {
    await db
      .update(conversationStates)
      .set({ phase, pendingConfirm, contextJson, updatedAt: new Date().toISOString() })
      .where(eq(conversationStates.id, existing.id));
  } else {
    await db.insert(conversationStates).values({ projectId, phase, pendingConfirm, contextJson });
  }
}

// === Transition logic ===

export interface TransitionResult {
  nextPhase: Phase;
  userPromptHint: string | null; // hint for the user-facing prompt
  allowedToolCategories: string[];
}

export function getPhaseConfig(phase: Phase): TransitionResult {
  switch (phase) {
    case "brainstorm":
      return {
        nextPhase: "plan",
        userPromptHint: "方案已收到。你觉得这个方案可以吗？确认后我会编写详细实施计划。",
        allowedToolCategories: ["read", "search", "market"],
      };
    case "plan":
      return {
        nextPhase: "execute",
        userPromptHint: "计划已编写。确认后开始逐步实施。",
        allowedToolCategories: ["read", "search", "market"],
      };
    case "execute":
      return {
        nextPhase: "verify",
        userPromptHint: null,
        allowedToolCategories: ["read", "write", "edit", "search", "deploy", "market", "mcp"],
      };
    case "verify":
      return {
        nextPhase: "execute",
        userPromptHint: null,
        allowedToolCategories: ["read", "search"],
      };
  }
}

// === Determine next phase based on user response ===

export function detectConfirmation(message: string): boolean {
  const confirmPatterns = [/^[好可以行对嗯okyes]/, /确认/, /没问题/, /开始/, /执行/, /继续/, /同意/, /按.*方案/];
  const rejectPatterns = [/不/, /换.*方案/, /重新/, /不要/, /算了/];

  if (rejectPatterns.some(p => p.test(message))) return false;
  return confirmPatterns.some(p => p.test(message));
}

export async function advancePhase(
  projectId: number,
  currentPhase: Phase,
  userMessage: string,
  taskLevel: "light" | "medium" | "heavy",
): Promise<Phase> {
  // Light tasks: always execute directly
  if (taskLevel === "light") {
    await setWorkflowState(projectId, "execute");
    return "execute";
  }

  // Medium tasks: execute directly
  if (taskLevel === "medium") {
    await setWorkflowState(projectId, "execute");
    return "execute";
  }

  // Heavy tasks: enforce phase progression
  if (currentPhase === "execute" && taskLevel === "heavy") {
    // Force into brainstorm first time
    await setWorkflowState(projectId, "brainstorm", false, null);
    return "brainstorm";
  }

  if (currentPhase === "brainstorm") {
    if (detectConfirmation(userMessage)) {
      await setWorkflowState(projectId, "plan", false, null);
      return "plan";
    }
    // Stay in brainstorm for revision
    return "brainstorm";
  }

  if (currentPhase === "plan") {
    if (detectConfirmation(userMessage)) {
      await setWorkflowState(projectId, "execute", false, null);
      return "execute";
    }
    return "plan";
  }

  return currentPhase;
}
