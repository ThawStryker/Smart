const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-200">
        <BoltIcon />
      </div>
      <span className="font-bold text-lg tracking-tight text-neutral-900">Smart</span>
    </div>
  );
}
