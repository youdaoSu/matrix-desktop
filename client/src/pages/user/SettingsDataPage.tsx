import { useState } from 'react';
import { Archive, Database, FolderOpen, HardDrive, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@client/src/components/ui/alert';
import { Button } from '@client/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@client/src/components/ui/card';

export default function SettingsDataPage() {
  const [backingUp, setBackingUp] = useState(false);

  const createBackup = async () => {
    if (!window.matrixDesktop?.isDesktop) {
      toast.error('请在矩效桌面版中使用数据库备份');
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
      toast.error('请在矩效桌面版中打开数据目录');
      return;
    }
    const result = await window.matrixDesktop.openDataFolder();
    if (result.error) toast.error(result.error);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">数据与备份</h1>
        <p className="text-sm text-muted-foreground mt-1">保护账号、内容和系统设置等本地数据</p>
      </div>

      <Alert className="bg-primary/5 border-primary/20">
        <ShieldCheck className="w-4 h-4" />
        <AlertDescription>备份文件由您自行保存，平台登录 Cookie 不会写入数据库备份。</AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
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
