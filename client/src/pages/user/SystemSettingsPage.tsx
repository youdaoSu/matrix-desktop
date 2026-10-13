import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getUser } from '@/api';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppPreferences, saveAppPreferences } from '@/contexts/AppPreferences';
import { interactionSnapshotKeys, startupPages, type AppPreferences } from '@shared/app-preferences';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import SettingsNotifyPage from './SettingsNotifyPage';

function Row({title,description,children}:{title:string;description:string;children:ReactNode}) {
  return <div className="flex flex-wrap items-center justify-between gap-4 border-b py-4 last:border-0"><div className="max-w-xl"><h3 className="text-sm font-medium">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>{children}</div>;
}
const titles={general:'通用设置',privacy:'隐私设置',notify:'通知设置',about:'关于矩效'};
const pageNames=['首页','账号管理','单条发布','评论管理','任务记录'];
export default function SystemSettingsPage({section}:{section:keyof typeof titles}) {
  const prefs=useAppPreferences(),{theme,setTheme}=useTheme(),navigate=useNavigate();
  const [system,setSystem]=useState<MatrixSystemSettings>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[clearOpen,setClearOpen]=useState(false);
  useEffect(()=>{let active=true;setError('');setClearOpen(false);if(window.matrixDesktop?.systemSettings)void window.matrixDesktop.systemSettings({command:'read'}).then(result=>{if(active){setSystem(result);setError(result.error||'');}}).catch(()=>{if(active)setError('桌面设置读取失败，请重试');});return()=>{active=false;};},[section]);
  const native=async(input:Parameters<NonNullable<typeof window.matrixDesktop>['systemSettings']>[0])=>{
    setBusy(true);setError('');try{if(!window.matrixDesktop?.systemSettings)throw Error('请在新版矩效安装版中使用此功能');const result=await window.matrixDesktop.systemSettings(input);if(result.error)throw Error(result.error);if(result.version)setSystem(result);if(result.requested)toast.success('已向 Windows 请求显示通知；是否展示取决于系统权限和勿扰模式');}catch(e){setError(e instanceof Error?e.message:'设置失败');}finally{setBusy(false);}
  };
  const save=(patch:Partial<AppPreferences>)=>{try{saveAppPreferences(patch);toast.success('设置已保存并生效');}catch(e){toast.error(e instanceof Error?e.message:'保存失败');}};
  const toggle=(key:Exclude<keyof AppPreferences,'startupPage'>)=> <input aria-label={key} type="checkbox" className="h-4 w-4 accent-orange-500" checked={prefs[key]} onChange={e=>save({[key]:e.target.checked})}/>;
  const owner=getUser()?.id||'',keys=interactionSnapshotKeys(Object.keys(localStorage),owner);
  return <div className="mx-auto max-w-4xl space-y-5 pb-8" data-system-settings={section}>
    <header><h1 className="text-xl font-semibold">{titles[section]}</h1><p className="mt-1 text-sm text-muted-foreground">显示、隐私与提醒偏好按矩效账号保存在本机；缩放和开机启动属于本机设备设置。</p></header>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    <Card><CardHeader><CardTitle className="text-base">{titles[section]}</CardTitle></CardHeader><CardContent>
      {section==='general'&&<>
        <Row title="界面主题" description="立即应用并记住偏好，跟随系统可自动切换明亮与深色。"><select aria-label="界面主题" className="rounded border bg-background p-2 text-sm" value={theme} onChange={e=>{try{setTheme(e.target.value as typeof theme);}catch{toast.error('主题保存失败');}}}><option value="light">明亮</option><option value="dark">深色</option><option value="system">跟随系统</option></select></Row>
        <Row title="界面缩放" description="调整整个矩效窗口的显示大小；各账号官方网页仍可单独缩放。"><select aria-label="矩效界面缩放" disabled={busy||!system?.version} value={system?.zoom||1} className="rounded border bg-background p-2 text-sm" onChange={e=>void native({command:'zoom',zoom:Number(e.target.value)})}>{[0.8,0.9,1,1.1,1.2].map(value=><option key={value} value={value}>{Math.round(value*100)}%</option>)}</select></Row>
        <Row title="默认首页" description="从默认入口启动或重新登录后打开此页面；不会覆盖主动打开的页面，也不自动发布或发送消息。"><select aria-label="默认首页" value={prefs.startupPage} onChange={e=>save({startupPage:e.target.value})} className="rounded border bg-background p-2 text-sm">{startupPages.map((page,index)=><option value={page} key={page}>{pageNames[index]}</option>)}</select></Row>
        <Row title="开机启动矩效" description="登录 Windows 后启动已安装的矩效，不自动执行平台操作。开发模式不可设置。"><input aria-label="开机启动矩效" type="checkbox" checked={system?.autoStart||false} disabled={busy||!system?.packaged} onChange={e=>void native({command:'auto-start',enabled:e.target.checked})}/></Row>
        <Row title="账号与数据备份" description="账号资料、密码与数据库备份仍保留在原有设置中。"><Button variant="outline" onClick={()=>navigate('/settings/data')}>打开数据与备份</Button></Row>
      </>}
      {section==='privacy'&&<>
        <Row title="隐藏矩效账号区域" description="模糊矩效内的账号列表、账号页签和任务账号，方便展示屏幕。不会遮挡内嵌官方网页，也不会删除或加密底层数据。">{toggle('maskAccountDetails')}</Row>
        <Row title="允许保存互动快照" description="关闭后不读取或保存本地评论、私信会话、粉丝快照；当前页面仍可临时读取。已有快照不会自动删除。">{toggle('retainInteractionSnapshots')}</Row>
        <Row title="清除本账号互动快照" description={`当前有 ${keys.length} 份本地快照及备注。只清除当前矩效用户的互动快照，不清除平台登录、绑定账号、任务、草稿或数据库。`}><Button variant="outline" disabled={!keys.length} onClick={()=>setClearOpen(true)}>清除互动快照</Button></Row>
        <p className="pt-4 text-xs leading-6 text-muted-foreground">平台登录会话保存在本机对应账号隔离目录。访问官方网页会按平台自己的隐私规则与服务器通信；矩效不会替代平台授权或本人验证。诊断复制不包含密码、Cookie、令牌或用户消息。</p>
      </>}
      {section==='notify'&&<>
        <Row title="显示未读角标" description="控制顶部通知和到期待办的数量显示；关闭不会标记消息已读。">{toggle('unreadBadges')}</Row>
        <Row title="到期待办提醒" description="开启后在矩效运行且登录时检查待办；关闭停止待办提醒轮询，不停止发布队列或删除待办。">{toggle('dueReminders')}</Row>
        <Row title="发布结果提醒" description="对本机发布队列新产生的成功、失败或待核对结果显示提示，不重复提示历史任务。">{toggle('publishAlerts')}</Row>
        <Row title="Windows 桌面通知" description="默认关闭。开启后可请求桌面提醒，内容只提示任务变化，不包含账号名称和消息正文。是否展示由 Windows 通知权限及勿扰模式决定。">{toggle('desktopAlerts')}</Row>
        <Row title="测试桌面通知" description="仅发送一条本机测试提示，不向任何平台发送消息。"><Button disabled={busy||!system?.notificationsSupported} variant="outline" onClick={()=>void native({command:'notify',category:'test'})}>发送测试通知</Button></Row>
      </>}
      {section==='about'&&<>
        <Row title="矩效 Matrix" description="Windows 个人创作者多账号管理客户端。平台能力以账号权限和官方页面实际可用操作为准。"><span className="rounded bg-primary/10 px-3 py-1 text-sm text-primary">{system?.version?`v${system.version}`:'网页版／桌面版本信息不可用'}</span></Row>
        <Row title="运行环境" description={`系统：${system?.platform||'浏览器'} · 架构：${system?.arch||'—'} · Electron：${system?.electron||'—'} · Node：${system?.node||'—'}`}><Button variant="outline" disabled={!system?.version} onClick={()=>void navigator.clipboard.writeText(`矩效 ${system?.version}\n${system?.platform} ${system?.arch}\nElectron ${system?.electron}\nNode ${system?.node}`).then(()=>toast.success('已复制无账号内容的版本信息')).catch(()=>toast.error('复制失败'))}>复制版本信息</Button></Row>
        <Row title="版本与更新" description="打开项目的 GitHub Releases 查看版本与验收说明。私有仓库需要你的 GitHub 账号权限；此按钮不自动下载、安装或上传诊断数据。"><Button variant="outline" disabled={busy||!system?.version} onClick={()=>void native({command:'releases'})}>查看 GitHub 版本</Button></Row>
        <Row title="数据目录与问题排查" description="备份及本机数据目录入口保留，不展示本机密钥或 Cookie。"><Button variant="outline" onClick={()=>navigate('/settings/data')}>数据与备份</Button></Row>
      </>}
    </CardContent></Card>
    {section==='notify'&&<SettingsNotifyPage/>}
    <Dialog open={clearOpen} onOpenChange={setClearOpen}><DialogContent><DialogHeader><DialogTitle>清除本账号的互动快照？</DialogTitle><DialogDescription>快照和备注无法恢复。平台账号、登录 Cookie、数据库、任务记录与草稿不会删除。</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setClearOpen(false)}>取消</Button><Button variant="destructive" onClick={()=>{if(getUser()?.id!==owner){toast.error('登录用户已变化');return;}try{for(const key of interactionSnapshotKeys(Object.keys(localStorage),owner))localStorage.removeItem(key);window.dispatchEvent(new Event('matrix:preferences-updated'));window.dispatchEvent(new Event('matrix:interaction-snapshots-cleared'));setClearOpen(false);toast.success('已清除本账号互动快照，账号登录和业务数据保留');}catch{toast.error('清除失败，请检查本地存储');}}}>确认清除互动快照</Button></div></DialogContent></Dialog>
  </div>;
}
