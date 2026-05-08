import { useState, useEffect, useCallback } from "react";
import { client } from "@/lib/edgespark";

export interface Project {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  progress: number;
  config: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useProjects() {
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.api.fetch("/api/projects");
      const data = await res.json();
      setProjectsList(data as Project[]);
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (name: string, description?: string) => {
    const res = await client.api.fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    if (!res.ok) throw new Error("Failed to create project");
    const project = await res.json();
    setProjectsList((prev) => [project, ...prev]);
    return project;
  };

  const deleteProject = async (id: number) => {
    const res = await client.api.fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete project");
    setProjectsList((prev) => prev.filter((p) => p.id !== id));
  };

  return { projectsList, loading, createProject, deleteProject, refresh: fetchProjects };
}
