import { useState } from 'react';
import { Archive, Database, FolderOpen, HardDrive, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@client/src/components/ui/card';

export default function SettingsDataPage() {
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const createBackup = async () => {
    if (!window.matrixDesktop?.isDesktop) {
      toast.error('请在远效桌面版中使用数据库备份');
      return;
    }
    setBackingUp(true);
    try {
      const result = await window.matrixDesktop.createDatabaseBackup();
      if (result.error) toast.error(result.error);
      else if (!result.cancelled && result.path) toast.success(`备份已保存：${result.path}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '备份失败');
    } finally {
      setBackingUp(false);
    }
  };

  const openDataFolder = async () => {
    if (!window.matrixDesktop?.isDesktop) {
      toast.error('请在远效桌面版中打开数据目录');
      return;
    }
    const result = await window.matrixDesktop.openDataFolder();
    if (result.error) toast.error(result.error);
  };

  const restoreBackup = async () => {
    if (!window.matrixDesktop?.isDesktop) {
      toast.error('请在远效桌面版中恢复数据库备份');
      return;
    }
    setRestoring(true);
    try {
      const result = await window.matrixDesktop.restoreDatabaseBackup();
      if (result.error) toast.error(result.error);
      else if (result.restored) toast.success('恢复完成，远效正在重新启动');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '恢复失败');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">数据与备份</h1>
        <p className="text-sm text-muted-foreground mt-1">保护账号、内容和系统设置等本地数据</p>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <ShieldCheck className="w-4 h-4" />
        <AlertDescription>备份文件由您自行保存。数据库备份不包含平台登录 Cookie、本机互动快照、发布队列或界面与设备偏好；这些保存在本机数据目录，恢复数据库不会自动还原它们。</AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Archive className="w-4 h-4" />创建数据库备份</CardTitle>
            <CardDescription>生成可迁移的完整数据库备份文件，建议定期保存到其他磁盘。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={createBackup} disabled={backingUp}>
              <HardDrive className="w-4 h-4 mr-2" />{backingUp ? '正在备份…' : '选择位置并创建备份'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><RotateCcw className="w-4 h-4" />恢复数据库备份</CardTitle>
            <CardDescription>验证备份文件后覆盖当前数据库，完成后软件会自动重启。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={restoreBackup} disabled={restoring}>
              <RotateCcw className="w-4 h-4 mr-2" />{restoring ? '正在恢复…' : '选择备份并恢复'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4" />本机数据目录</CardTitle>
            <CardDescription>打开日志、配置和内置数据库所在目录，便于排查和人工归档。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={openDataFolder}><FolderOpen className="w-4 h-4 mr-2" />打开数据目录</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
