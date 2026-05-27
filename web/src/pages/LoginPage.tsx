import { useEffect, useRef } from "react";
import { client } from "@/lib/edgespark";
import { Logo } from "@/components/layout/Logo";

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
        <div className="flex justify-center mb-6">
          <Logo />
        </div>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
