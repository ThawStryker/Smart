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

// Generate a consistent gradient color from project name
const gradients = [
  "from-amber-400 to-orange-500",
  "from-indigo-400 to-violet-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-sky-400 to-blue-500",
  "from-fuchsia-400 to-purple-500",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function StatusBadge({ project }: { project: any }) {
  if (project.publishStatus === "published") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">已发布</span>;
  }
  if (project.deployStatus === "deployed" || project.deployStatus === "deploying") {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">未发布</span>;
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-400 font-medium">未上线</span>;
}

export function Dashboard() {
  const { projectsList, loading: projectsLoading, createProject, deleteProject } = useProjects();
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
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-300">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                </svg>
              </div>
              <p className="text-xl font-semibold text-neutral-900 mb-2">暂无项目</p>
              <p className="text-sm text-neutral-600 mt-2">点击上方按钮创建你的第一个 AI 工具</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectsList.map((project: any) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/project/${project.id}`)}
                  className="smart-card p-5 cursor-pointer group"
                >
                  <div className="flex items-start gap-4 mb-3">
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getGradient(project.name)} flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0 group-hover:scale-105 transition-transform duration-300`}>
                      {getInitials(project.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-[15px] text-primary truncate group-hover:text-amber-600 transition-colors">{project.name}</h3>
                        <StatusBadge project={project} />
                      </div>
                      {project.description ? (
                        <p className="text-xs text-secondary mt-1 line-clamp-1">{project.description}</p>
                      ) : (
                        <p className="text-xs text-tertiary mt-1">{new Date(project.createdAt).toLocaleDateString()} 创建</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定删除项目「${project.name}」？`)) {
                          deleteProject(project.id);
                        }
                      }}
                      className="text-xs text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors px-2 py-1 opacity-0 group-hover:opacity-100"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}
