/** 与 web/src/components/work/icons.tsx 的 agentAvatars 保持一致 */
export const AGENT_AVATARS = [
  "🐱", "🐶", "🦊", "🐼", "🐨", "🐯", "🦁", "🐸", "🐵", "🐰",
  "🐻", "🦄", "🐙", "🦋", "🐞", "🐣", "🦉", "🐳", "🦀", "🐲",
];

export function pickRandomAvatar(): string {
  return AGENT_AVATARS[Math.floor(Math.random() * AGENT_AVATARS.length)];
}

/** 仅用于给旧数据补头像，冻结当前展示；新 Agent 用 pickRandomAvatar */
export function hashNameAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AGENT_AVATARS[Math.abs(hash) % AGENT_AVATARS.length];
}
