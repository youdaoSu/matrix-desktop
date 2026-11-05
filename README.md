# 远效

Windows 和 Mac 多平台账号与内容管理客户端。当前版本 **2.10.0-rc.338**。

[Windows x64 安装包](https://github.com/youdaoSu/matrix-desktop/releases/download/v2.10.0-rc.338/YuanXiao-2.10.0-rc.338-Setup.exe) · [Mac Apple Silicon DMG](https://github.com/youdaoSu/matrix-desktop/releases/download/v2.10.0-rc.338/YuanXiao-2.10.0-rc.338-Mac-arm64.dmg) · [Mac PKG](https://github.com/youdaoSu/matrix-desktop/releases/download/v2.10.0-rc.338/YuanXiao-2.10.0-rc.338-Mac-arm64.pkg) · [Mac ZIP](https://github.com/youdaoSu/matrix-desktop/releases/download/v2.10.0-rc.338/YuanXiao-2.10.0-rc.338-Mac-arm64.zip)

[查看最新版发布页](https://github.com/youdaoSu/matrix-desktop/releases/latest) · [历史版本](https://github.com/youdaoSu/matrix-desktop/releases)

Mac 版为 Apple Silicon 预览版，要求 macOS 13 或更新版本。应用使用临时签名，尚未通过 Apple 公证，系统可能拦截首次打开。

## 本次更新

- 新增 Apple Silicon 原生 Mac 客户端。Mac 和 Windows 共用远效登录、会员和激活码。
- Mac 自带本地 PostgreSQL，平台登录会话、草稿和素材保存在当前设备。
- Mac 视频号使用内置 Chromium 会话。Windows 视频号继续使用原生 Edge WebView2。

## 验证与开发

Windows 247 组回归和 25 项包内检查通过。Mac 在 macOS 15.8.1 上通过原生启动、内置数据库备份、云端登录请求和正常退出验证。第三方平台发布采用隔离验证。

Windows 构建入口为 scripts/build-desktop.ps1。Mac 构建入口为 scripts/build-desktop-mac.sh，内置 PostgreSQL 构建入口为 scripts/build-postgres-mac.sh。

[历史开发记录](docs/historical-development-notes.md)
