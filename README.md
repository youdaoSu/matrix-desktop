# 远效

Windows 多平台账号与内容管理客户端，当前版本 **2.10.0-rc.323**（原名矩效 Matrix）。

[下载远效 RC323](https://github.com/youdaoSu/matrix-desktop/releases/tag/v2.10.0-rc.323) · [所有历史版本](https://github.com/youdaoSu/matrix-desktop/releases)

请选择名称为 `YuanXiao-2.10.0-rc.323-Setup.exe` 的 Windows 安装包。旧版 `Matrix-2.9.0-Setup.exe` 是历史“矩效”版本；源码更新不会自动替换历史安装包。

## 本次更新

- 已发布但待审核的作品自动有限复查，不再要求设置追评；审核结果到达后更新任务并补读作品编号。
- 一键评论入口位于“粉丝互动 → 评论管理”。使用作品所属账号，人工填写并预览确认一条评论；缺少作品编号时可只读重试，不重发作品或评论。
- 主账号与分工归入账号管理，自动化配置统一放入新建计划。
- 清理失效账号/会话缓存、卸载监听和排队图片预览，减少大列表的临时内存副本。
- 桌面运行时固定为 Electron 44.7.2，修正旧运行时后台绘制暂停后恢复不稳定的问题。

## 验证与范围

本机已完成 **246 组源码回归、97 组实际安装包检查及 39 个物理 worker 依赖校验**，升级前冷备份、升级后资料字节和原密钥校验通过，启动资源与安装内容一致。

本轮没有向真实平台发布测试作品、评论或私信。隔离测试不等同全部平台实发验收，也不代表长期运行完全无内存泄漏。本人粉丝分批私信当前仅支持抖音，保留身份、历史联系记录、配额和未知回执暂停限制。

源码与安装包不包含个人账号库、登录会话、密钥或业务备份。公开版本仍使用 RC 编号，真实业务结果以平台回执为准。

## 开发与说明

依赖固定在 package-lock.json；桌面构建入口为 scripts/build-desktop.ps1（Windows PowerShell 5.1）。发行前须通过完整回归、包内容和升级资料保留检查。

[RC323 说明](docs/rc323-review-and-runtime.md) · [评论管理入口](docs/rc322-single-comment-entry.md) · [内存风险修复](docs/memory-risk-hardening-20261104.md) · [账号与计划布局](docs/rc321-account-plan-structure.md) · [历史开发记录](docs/historical-development-notes.md)
