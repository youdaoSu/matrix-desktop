import { useState } from 'react';
import type { ComponentType, InputHTMLAttributes, ReactNode } from 'react';
import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-7 text-center lg:text-left">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <Card className="overflow-hidden rounded-3xl border border-white bg-white shadow-[0_24px_80px_-32px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/[0.04]">
        <CardContent className="p-6 sm:p-8">{children}</CardContent>
      </Card>
      {footer && <div className="mt-5 text-center text-sm text-slate-500">{footer}</div>}
    </div>
  );
}

export function AuthField({
  id,
  label,
  icon: Icon,
  error,
  className = '',
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</Label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
        <Input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-12 rounded-xl border-slate-200 bg-slate-50/70 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-400 focus-visible:bg-white focus-visible:ring-blue-500/20 ${Icon ? 'pl-10' : 'px-3.5'} ${className}`}
          {...inputProps}
        />
      </div>
      {error && <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function AuthPasswordField({
  id,
  label,
  error,
  ...inputProps
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  id: string;
  label?: string;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      {label && <Label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</Label>}
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-12 rounded-xl border-slate-200 bg-slate-50/70 px-3.5 pr-11 text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-400 focus-visible:bg-white focus-visible:ring-blue-500/20"
          {...inputProps}
        />
        <button
          type="button"
          aria-label={visible ? '隐藏密码' : '显示密码'}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p id={`${id}-error`} className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Alert variant="destructive" role="alert" className="rounded-xl border-rose-200 bg-rose-50 text-rose-800">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function AuthSubmit({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return (
    <Button
      type="submit"
      disabled={loading}
      className="h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:from-blue-700 hover:to-indigo-700 hover:shadow-blue-700/25 disabled:opacity-70"
    >
      {loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

export function getAuthError(error: any, fallback: string) {
  const message = error?.response?.data?.message;
  return Array.isArray(message) ? message.join('；') : message || fallback;
}
