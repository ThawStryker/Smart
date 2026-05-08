import { TopNav } from "@/components/layout/TopNav";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";

export function ProjectDetail() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams();

  if (loading) return <div className="p-8 text-neutral-500">加载中...</div>;
  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} />
      <WorkspaceLayout
        left={
          <div className="flex-1 flex flex-col">
            <div className="bg-white border-b border-neutral-200 px-6 py-4">
              <h1 className="font-medium">项目 #{projectId}</h1>
            </div>
            <div className="flex-1 flex items-center justify-center text-neutral-400">
              <p>工作区开发中...</p>
            </div>
          </div>
        }
        right={
          <div className="flex-1 flex items-center justify-center text-neutral-400 bg-white">
            <p>预览区域开发中...</p>
          </div>
        }
      />
    </div>
  );
}
