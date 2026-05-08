import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TopNav } from "@/components/layout/TopNav";
import { useAuth } from "@/hooks/useAuth";
import { useProjects } from "@/hooks/useProjects";

export function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { projectsList, loading: projectsLoading, createProject, deleteProject } = useProjects();
  const navigate = useNavigate();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");

  if (authLoading) return <div className="p-8 text-neutral-500">加载中...</div>;
  if (!user) {
    navigate("/login");
    return null;
  }

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const project = await createProject(newName.trim());
    setNewName("");
    setShowNewForm(false);
    navigate(`/project/${project.id}`);
  };

  return (
    <div className="h-screen flex flex-col">
      <TopNav user={user} />
      <main className="flex-1 p-8 bg-neutral-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-neutral-800">我的项目</h1>
            <button
              onClick={() => setShowNewForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              + 新建项目
            </button>
          </div>

          {showNewForm && (
            <div className="bg-white border border-neutral-200 rounded-lg p-4 mb-6 flex gap-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="输入项目名称..."
                className="flex-1 px-3 py-2 border border-neutral-300 rounded text-sm outline-none focus:border-blue-500"
              />
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                创建
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-4 py-2 text-neutral-500 rounded text-sm hover:bg-neutral-100"
              >
                取消
              </button>
            </div>
          )}

          {projectsLoading ? (
            <div className="text-center text-neutral-400 py-20">
              <p>加载中...</p>
            </div>
          ) : projectsList.length === 0 ? (
            <div className="text-center text-neutral-400 py-20">
              <p className="text-lg">暂无项目</p>
              <p className="text-sm mt-2">点击上方按钮创建你的第一个 AI 工具</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {projectsList.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="bg-white border border-neutral-200 rounded-lg p-5 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-neutral-800">{project.name}</h3>
                      {project.description && (
                        <p className="text-sm text-neutral-500 mt-1">{project.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-neutral-100 px-2 py-1 rounded text-neutral-500">
                        {project.status}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("确定删除此项目？")) deleteProject(project.id);
                        }}
                        className="text-neutral-400 hover:text-red-500 transition-colors text-sm"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-400 mt-3">
                    更新于 {new Date(project.updatedAt).toLocaleString("zh-CN")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
