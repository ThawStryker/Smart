import { useEffect, useState } from "react";
import { client } from "@/lib/edgespark";
import { useConfirm } from "@/components/shared/useConfirm";

interface AdminDomain {
  subdomain: string;
  hostname: string;
  protected: boolean;
  available: boolean;
  availability: string;
  availabilityLabel: string;
  projectLabel: string;
  projectId: number | null;
  projectName: string | null;
  published: boolean;
  records: Array<{ type: string; rr: string; value: string; status: string }>;
}

function availabilityClass(label: string): string {
  if (label === "可用") return "bg-green-50 text-green-600";
  if (label === "部署中") return "bg-amber-50 text-amber-600";
  if (label === "仅解析") return "bg-neutral-100 text-neutral-500";
  return "bg-red-50 text-red-500";
}

function projectClass(label: string): string {
  if (label === "已发布") return "bg-green-50 text-green-600";
  if (label === "未发布") return "bg-amber-50 text-amber-600";
  return "bg-neutral-100 text-neutral-400";
}

export function DomainManager() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [rows, setRows] = useState<AdminDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDomains = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await client.api.fetch("/api/admin/domains");
      const text = await res.text();
      let data: { error?: string; aliyunError?: string; domains?: AdminDomain[] } = {};
      try { data = JSON.parse(text); } catch { /* 非 JSON */ }
      if (!res.ok) throw new Error(data.error || text.slice(0, 120) || "加载失败");
      setRows(Array.isArray(data.domains) ? data.domains : []);
      if (data.aliyunError) setError(data.aliyunError);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDomains(); }, []);

  const remove = async (row: AdminDomain) => {
    if (row.protected) return;
    const ok = await confirm(
      `删除 ${row.hostname}？对应项目会回到未上线；已发布作品会自动下架。`,
      { confirmText: "删除" },
    );
    if (!ok) return;
    setDeleting(row.subdomain);
    try {
      const res = await client.api.fetch(`/api/admin/domains/${encodeURIComponent(row.subdomain)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "删除失败");
      await fetchDomains();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div>
      {ConfirmDialog}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-neutral-400">来自阿里云 torresx.cn 的全部子域</p>
        <button onClick={fetchDomains} className="text-sm text-amber-600 hover:text-amber-700">刷新</button>
      </div>
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading ? <p className="text-sm text-neutral-400">加载中...</p> :
        rows.length === 0 ? <p className="text-sm text-neutral-400">暂无子域名</p> :
        rows.map((row) => (
          <div key={row.subdomain} className="p-3 bg-white border border-[#f0f0f0] rounded-xl mb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-neutral-900 break-all">{row.hostname}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${availabilityClass(row.availabilityLabel)}`}>
                    {row.availabilityLabel}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${projectClass(row.projectLabel)}`}>
                    {row.projectLabel}
                  </span>
                  {row.projectName && (
                    <span className="text-[10px] text-neutral-400">项目 {row.projectName}</span>
                  )}
                </div>
                {row.records.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {row.records.map((rec) => (
                      <div key={`${rec.type}-${rec.rr}-${rec.value}`} className="text-[10px] text-neutral-400 break-all">
                        {rec.type} {rec.rr} → {rec.value}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!row.protected && (
                <button
                  onClick={() => remove(row)}
                  disabled={deleting === row.subdomain}
                  className="text-xs bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 disabled:opacity-40 shrink-0"
                >
                  {deleting === row.subdomain ? "删除中" : "删除"}
                </button>
              )}
            </div>
          </div>
        ))
      }
    </div>
  );
}
