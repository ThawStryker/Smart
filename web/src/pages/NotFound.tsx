import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-neutral-300 mb-4">404</h1>
        <p className="text-neutral-500 mb-6">页面未找到</p>
        <Link to="/dashboard" className="text-blue-600 hover:underline">
          返回首页
        </Link>
      </div>
    </div>
  );
}
