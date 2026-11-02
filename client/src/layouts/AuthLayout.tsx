import { Outlet } from 'react-router-dom';
import AppBrandMark from '@/components/AppBrandMark';

export default function AuthLayout() {
  return <div className="matrix-auth matrix-auth-compact">
    <header className="matrix-auth-brand"><AppBrandMark /><strong>远效</strong><span>创作者矩阵工作台</span></header>
    <main><Outlet /><p className="matrix-auth-footer">本机账号管理 · 官方页面操作</p></main>
  </div>;
}
