# 远效

Windows 多平台账号与内容管理客户端，原名矩效 Matrix。当前版本 **2.10.0-rc.337**。

[下载 Windows 安装包](https://github.com/youdaoSu/matrix-desktop/releases/download/v2.10.0-rc.337/YuanXiao-2.10.0-rc.337-Setup.exe) · [查看最新版发布页](https://github.com/youdaoSu/matrix-desktop/releases/latest) · [历史版本](https://github.com/youdaoSu/matrix-desktop/releases)

## 本次更新

- 远效登录、会员和激活码接入统一账号服务，升级后可跨设备使用同一远效账号。
- 管理员修改密码时需要确认新密码，最短 8 个字符。
- 修复从旧版本升级后，桌面端旧安全会话拦截云端登录的问题。

## 验证与开发

247 组完整回归和 25 项包内检查通过。已验证本机升级、资料备份与桌面云端登录请求。

依赖固定在 package-lock.json。桌面构建入口为 scripts/build-desktop.ps1，使用 Windows PowerShell 5.1。

[历史开发记录](docs/historical-development-notes.md)
