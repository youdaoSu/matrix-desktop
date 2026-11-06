# 远效

Windows 和 Mac 多平台账号与内容管理客户端。当前版本 **2.10.0-rc.342**。

[Windows x64 安装包](https://github.com/youdaoSu/yuanxiao/releases/download/v2.10.0-rc.342/YuanXiao-2.10.0-rc.342-Setup.exe) · [Mac Apple Silicon DMG](https://github.com/youdaoSu/yuanxiao/releases/download/v2.10.0-rc.342/YuanXiao-2.10.0-rc.342-Mac-arm64.dmg) · [Mac PKG](https://github.com/youdaoSu/yuanxiao/releases/download/v2.10.0-rc.342/YuanXiao-2.10.0-rc.342-Mac-arm64.pkg) · [Mac ZIP](https://github.com/youdaoSu/yuanxiao/releases/download/v2.10.0-rc.342/YuanXiao-2.10.0-rc.342-Mac-arm64.zip)

[查看最新版发布页](https://github.com/youdaoSu/yuanxiao/releases/latest) · [历史版本](https://github.com/youdaoSu/yuanxiao/releases)

Mac 版为 Apple Silicon 预览版，要求 macOS 13 或更新版本。应用使用临时签名，尚未通过 Apple 公证，系统可能拦截首次打开。

## 本次更新

- Windows 主程序、辅助进程、安装显示名和诊断导出文件统一为远效 / YuanXiao。Mac 应用名为远效。
- 仓库与版本页统一为 youdaoSu/yuanxiao；保留原账号资料和升级标识。
- Mac 和 Windows 共用远效登录、会员和激活码。
- Mac 自带本地 PostgreSQL，平台登录会话、草稿和素材保存在当前设备。
- Mac 视频号使用内置 Chromium 会话。Windows 视频号继续使用原生 Edge WebView2。

## 验证与开发

Windows 251 组检查、包内核对与实际升级验证通过；Mac 三种安装载体及原生启动验证通过。第三方平台发布采用隔离验证；不会为了名称核对向真实账号发送内容。

Windows 构建入口为 scripts/build-desktop.ps1。Mac 构建入口为 scripts/build-desktop-mac.sh，内置 PostgreSQL 构建入口为 scripts/build-postgres-mac.sh。

[历史开发记录](docs/historical-development-notes.md)
