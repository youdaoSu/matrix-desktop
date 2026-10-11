import { Outlet } from 'react-router-dom';
import { Layers3 } from 'lucide-react';

export default function AuthLayout() {
  return <div className="matrix-auth matrix-auth-compact">
    <header className="matrix-auth-brand"><Layers3 size={24} /><strong>矩效 Matrix</strong><span>创作者矩阵工作台</span></header>
    <main><Outlet /><p className="matrix-auth-footer">本机账号管理 · 官方页面操作</p></main>
  </div>;
}
