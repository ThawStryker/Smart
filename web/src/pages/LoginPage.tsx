import { useEffect, useRef } from "react";
import { client } from "@/lib/edgespark";

export function LoginPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const mounted = client.authUI.mount(containerRef.current, {
      redirectTo: "/dashboard",
    });
    return () => mounted.destroy();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-neutral-200 w-full max-w-md">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-10 h-10 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xl font-bold">S</span>
          </div>
          <span className="font-bold text-2xl">Smart</span>
        </div>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
