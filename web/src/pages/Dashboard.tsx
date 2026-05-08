import { useNavigate } from "react-router-dom";
import { TopNav } from "@/components/layout/TopNav";
import { useAuth } from "@/hooks/useAuth";

export function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="p-8 text-neutral-500">加载中...</div>;
  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} />
      <main className="flex-1 p-8 bg-neutral-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-neutral-800">我的项目</h1>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
              + 新建项目
            </button>
          </div>
          <div className="text-center text-neutral-400 py-20">
            <p className="text-lg">暂无项目</p>
            <p className="text-sm mt-2">点击上方按钮创建你的第一个 AI 工具</p>
          </div>
        </div>
      </main>
    </div>
  );
}
