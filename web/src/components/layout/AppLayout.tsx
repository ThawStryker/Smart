import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { TopNav } from "@/components/layout/TopNav";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

export function AppLayout() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useProfile();

  if (authLoading) return <LoadingSpinner />;
  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} isAdmin={isAdmin} />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
