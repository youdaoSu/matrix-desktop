import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import type { AppUser } from '@shared/api.interface';
import { axiosForBackend, setUser } from '@/api';
import { Avatar, AvatarFallback, AvatarImage } from '@client/src/components/ui/avatar';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { toast } from 'sonner';

function errorMessage(error: any, fallback: string) { return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback; }
export default function SettingsProfilePage() {
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const load = async () => { try { const response = await axiosForBackend.get('/api/users/profile'); const user = response.data?.data as AppUser; setProfile(user); setNickname(user.nickname || ''); setEmail(user.email || ''); setPhone(user.phone || ''); setAvatarUrl(user.avatarUrl || ''); } catch (error: any) { toast.error(errorMessage(error, '加载个人资料失败')); } };
  useEffect(() => { void load(); }, []);
  const save = async () => { setSaving(true); try { const response = await axiosForBackend.put('/api/users/profile', { nickname, email, phone, avatarUrl }); const user = response.data?.data as AppUser; setProfile(user); setUser(user); toast.success('个人资料已保存'); } catch (error: any) { toast.error(errorMessage(error, '保存个人资料失败')); } finally { setSaving(false); } };
  return <div className="mx-auto max-w-3xl space-y-5"><div><h1 className="text-xl font-semibold">个人资料</h1><p className="mt-1 text-sm text-muted-foreground">资料直接保存到当前用户数据库。</p></div><Card><CardHeader><CardTitle className="text-base">基本资料</CardTitle></CardHeader><CardContent className="space-y-5"><div className="flex items-center gap-4"><Avatar className="h-20 w-20"><AvatarImage src={avatarUrl} /><AvatarFallback><User className="h-8 w-8" /></AvatarFallback></Avatar><div><div className="font-medium">{profile?.username || '正在加载…'}</div><div className="text-sm text-muted-foreground">用户名不可修改</div></div></div><div className="grid gap-4 md:grid-cols-2"><div><Label>昵称</Label><Input className="mt-1" value={nickname} onChange={(event) => setNickname(event.target.value)} /></div><div><Label>邮箱</Label><Input className="mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div><Label>手机号</Label><Input className="mt-1" value={phone} onChange={(event) => setPhone(event.target.value)} /></div><div><Label>头像地址（HTTPS）</Label><Input className="mt-1" value={avatarUrl} onChange={(event) => setAvatarUrl(event.target.value)} placeholder="https://..." /></div></div><div className="flex justify-end"><Button disabled={saving || !profile} onClick={() => void save()}>{saving ? '保存中…' : '保存修改'}</Button></div></CardContent></Card></div>;
}
