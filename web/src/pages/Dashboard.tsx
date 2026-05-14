import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects } from "@/hooks/useProjects";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

// SVG Icons
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14,2 14,8 20,8" />
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

export function Dashboard() {
  const { projectsList, loading: projectsLoading, createProject } = useProjects();
  const navigate = useNavigate();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const project = await createProject(newName.trim());
    setNewName("");
    setShowNewForm(false);
    navigate(`/project/${project.id}`);
  };

  if (projectsLoading) return <LoadingSpinner />;

  return (
    <div className="p-6 animate-pageIn bg-[#fafafa]">
      <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-neutral-900">我的项目</h1>
              <p className="text-neutral-600 mt-1">管理和创建你的 AI 工具项目</p>
            </div>
            <button
              onClick={() => setShowNewForm(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all flex items-center gap-2"
            >
              <PlusIcon />
              新建项目
            </button>
          </div>

          {showNewForm && (
            <div className="bg-white border border-[#f0f0f0] rounded-xl p-6 mb-6 shadow-sm">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">创建新项目</h3>
              <div className="flex gap-3">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="输入项目名称..."
                  className="flex-1 px-4 py-2.5 border border-neutral-200 rounded-lg text-sm outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 transition-all"
                />
                <button
                  onClick={handleCreate}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-medium shadow-sm hover:shadow-md hover:shadow-amber-100 transition-all"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowNewForm(false)}
                  className="px-5 py-2.5 bg-neutral-100 text-neutral-600 rounded-lg text-sm hover:bg-neutral-200 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {projectsList.length === 0 ? (
            <div className="text-center text-neutral-400 py-20 bg-white border border-[#f0f0f0] rounded-xl shadow-sm">
              <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileIcon />
              </div>
              <p className="text-xl font-semibold text-neutral-900 mb-2">暂无项目</p>
              <p className="text-sm text-neutral-600 mt-2">点击上方按钮创建你的第一个 AI 工具</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectsList.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="bg-white border border-[#f0f0f0] rounded-xl p-6 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform duration-300">
                      <FileIcon />
                    </div>
                    <div className="text-xs text-neutral-400 flex items-center gap-1">
                      <CalendarIcon />
                      {new Date(project.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg mb-2 text-neutral-900 group-hover:text-amber-600 transition-colors">{project.name}</h3>
                  <p className="text-sm text-neutral-600 mb-4 line-clamp-2">
                    {project.description || "点击进入项目编辑"}
                  </p>
                  <div className="flex items-center text-xs text-neutral-400">
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">
                      {project.status || "活跃"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
