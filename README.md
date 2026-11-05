# 远效

Windows 多平台账号与内容管理客户端，原名矩效 Matrix。当前版本 **2.10.0-rc.334**。

[下载 Windows 安装包](https://github.com/youdaoSu/matrix-desktop/releases/download/v2.10.0-rc.334/YuanXiao-2.10.0-rc.334-Setup.exe) · [查看最新版发布页](https://github.com/youdaoSu/matrix-desktop/releases/latest) · [历史版本](https://github.com/youdaoSu/matrix-desktop/releases)

## 本次更新

- 「发单条作品」可选择视频或图文。当前图文适配抖音、小红书。
- 批量视频和图文沿用单条发布流程，每篇作品在不同平台并行处理，同平台账号按顺序提交。提交结果未确认时，后续作品停在上传前。
- 从「粉丝互动 → 评论管理」选定作品并点击「一键评论」。批量模式支持最多 100 个同平台账号，随机分配不同正文，确认预览后发送。
- 发布审核和互动结果支持后台有限复核，保留原回执。

## 验证与开发

247 组完整回归、9 项包内跨平台并行检查与 40 个已安装 worker 文件校验通过。已核对本机升级后的账号资料及启动资源，发布流程采用隔离测试。

依赖固定在 package-lock.json。桌面构建入口为 scripts/build-desktop.ps1，使用 Windows PowerShell 5.1。

[历史开发记录](docs/historical-development-notes.md)
