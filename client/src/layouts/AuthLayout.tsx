import { Outlet } from 'react-router-dom';
import { ArrowUpRight, Layers3, ShieldCheck, Sparkles, Zap } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="matrix-auth relative min-h-screen overflow-hidden bg-[#f4f6fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[1.04fr_0.96fr]">
        <aside className="relative hidden overflow-hidden bg-[#10182d] px-12 py-10 text-white lg:flex lg:flex-col xl:px-20">
          <div className="absolute -left-40 top-24 h-[28rem] w-[28rem] rounded-full bg-blue-500/20 blur-[100px]" />
          <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-violet-500/15 blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.24)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.24)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 shadow-lg shadow-blue-950/40">
              <Layers3 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-wide">矩效 Matrix</div>
              <div className="text-xs text-slate-400">创作者矩阵工作台</div>
            </div>
          </div>

          <div className="relative my-auto max-w-xl py-16">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-blue-100">
              <Sparkles className="h-3.5 w-3.5 text-blue-300" />
              让多平台运营清晰、高效
            </div>
            <h1 className="text-4xl font-semibold leading-[1.2] tracking-tight xl:text-5xl">
              把分散的账号，<br />
              <span className="bg-gradient-to-r from-blue-300 to-violet-300 bg-clip-text text-transparent">变成有序的矩阵。</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300">
              在一个工作台管理账号、内容和运营数据。连接官方平台时，授权过程会在矩效内完成。
            </p>
            <div className="mt-10 grid max-w-md grid-cols-2 gap-3">
              {[
                { icon: Layers3, title: '账号集中管理', detail: '多平台工作区' },
                { icon: ShieldCheck, title: '本地会话隔离', detail: '授权信息留在本机' },
                { icon: Zap, title: '流程清晰直观', detail: '重要状态一目了然' },
                { icon: ArrowUpRight, title: '数据持续沉淀', detail: '运营记录可追溯' },
              ].map(({ icon: Icon, title, detail }) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
                  <Icon className="mb-3 h-4 w-4 text-blue-300" />
                  <div className="text-sm font-medium">{title}</div>
                  <div className="mt-1 text-xs text-slate-400">{detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-between border-t border-white/10 pt-5 text-xs text-slate-500">
            <span>矩效 Matrix · 创作者矩阵管理</span>
            <span>安全连接 · 高效运营</span>
          </div>
        </aside>

        <main className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
          <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-blue-300/20 blur-[100px]" />
          <div className="relative z-10 w-full max-w-[460px]">
            <div className="mb-8 flex items-center justify-center gap-2 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
                <Layers3 className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold">矩效 Matrix</span>
            </div>
            <Outlet />
            <p className="mt-7 text-center text-xs text-slate-400">安全登录 · 官方授权 · 本机数据保护</p>
          </div>
        </main>
      </div>
    </div>
  );
}
