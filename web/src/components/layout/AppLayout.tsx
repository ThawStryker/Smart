import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { TopNav } from "@/components/layout/TopNav";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

export function AppLayout() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useProfile();

  if (authLoading) return (
    <div className="h-screen flex items-center justify-center bg-[#fafafa]">
      <LoadingSpinner />
    </div>
  );
  if (!user) { navigate("/login"); return null; }

  return (
    <div className="h-screen flex flex-col bg-[#fafafa]">
      <TopNav user={user} isAdmin={isAdmin} />
      <div className="flex-1 overflow-auto animate-pageIn">
        <Outlet />
      </div>
    </div>
  );
}
