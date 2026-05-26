
export const agentAvatars = ["🐱","🐶","🦊","🐼","🐨","🐯","🦁","🐸","🐵","🐰","🐻","🦄","🐙","🦋","🐞","🐣","🦉","🐳","🦀","🐲"];

export function getAgentAvatar(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return agentAvatars[Math.abs(hash) % agentAvatars.length];
}

// ── File icons (12x12 SVG) ──

export function GenericFileIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "var(--app-text-tertiary)"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function DocIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "#60a5fa"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

export function AgentIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "var(--app-accent)"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function HeartbeatIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "#f87171"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function ReadmeIcon({ active }: { active?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--app-accent)" : "var(--app-text-tertiary)"} strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

// ── Folder icons ──

export function DefaultFolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-text-tertiary)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      {open ? (
        <path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z" />
      ) : (
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      )}
    </svg>
  );
}

export function MemoryFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function SkillsFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export function HeartbeatFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f472b6" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function ContextFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

// ── File icon resolver ──

export function getFileIcon(name: string) {
  const base = name.split("/").pop() || name;
  if (base === "AGENTS.md") return AgentIcon;
  if (base === "heartbeat.md") return HeartbeatIcon;
  if (base === "README.md") return ReadmeIcon;
  if (base.endsWith(".md")) return DocIcon;
  return GenericFileIcon;
}
