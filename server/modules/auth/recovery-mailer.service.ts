import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { isEmail } from 'class-validator';
import * as nodemailer from 'nodemailer';

@Injectable()
export class RecoveryMailer {
  private transport?: nodemailer.Transporter;
  private from?: string;
  private readiness?: Promise<boolean>;
  private checkedAt = 0;

  constructor() {
    const host = process.env.MATRIX_SMTP_HOST?.trim();
    const user = process.env.MATRIX_SMTP_USER?.trim();
    const pass = process.env.MATRIX_SMTP_PASSWORD;
    const from = process.env.MATRIX_SMTP_FROM?.trim();
    const port = Number(process.env.MATRIX_SMTP_PORT || 465);
    const secureValue = process.env.MATRIX_SMTP_SECURE;
    const secure = secureValue === undefined ? port === 465 : secureValue === 'true';
    if (!host || !user || !pass || !from || !isEmail(from) || /[\s/@?#]/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || secureValue !== undefined && !['true','false'].includes(secureValue)) return;
    this.from = from;
    this.transport = nodemailer.createTransport({
      host, port, secure, requireTLS: !secure,
      auth: { user, pass }, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 8000, greetingTimeout: 5000, socketTimeout: 10000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
  }

  configured() { return Boolean(this.transport && this.from); }

  async ready() {
    if (!this.transport) return false;
    if (!this.readiness || Date.now() - this.checkedAt > 60000) {
      this.checkedAt = Date.now();
      this.readiness = this.transport.verify().then(() => true, () => false);
    }
    return this.readiness;
  }

  async requireReady() {
    if (!this.configured()) throw new ServiceUnavailableException('尚未配置真实邮件发送服务，请联系管理员配置 SMTP；未发送验证码');
    if (!await this.ready()) throw new ServiceUnavailableException('邮件服务暂时不可用，请稍后重试或联系管理员；未发送验证码');
  }

  async sendCode(email: string, code: string) {
    if (!this.transport || !this.from || !isEmail(email)) throw Error('Recovery mail unavailable');
    const result = await this.transport.sendMail({
      from: { name: '远效账号安全', address: this.from }, to: { address: email, name: '' },
      subject: '远效登录密码重置验证码',
      text: `你正在重置远效的登录密码。\n\n验证码：${code}\n\n验证码10分钟内有效，仅最近一次申请有效。请勿向任何人转发。\n如果不是本人操作，请忽略此邮件；密码不会因此改变。\n本操作不改变抖音、小红书、视频号、B站等平台账号的密码或登录信息。`,
    });
    if (!result.accepted?.length || result.rejected?.length) throw Error('Recovery mail not accepted');
  }

  async sendChanged(email: string) {
    if (!this.transport || !this.from || !isEmail(email)) return;
    await this.transport.sendMail({
      from: { name: '远效账号安全', address: this.from }, to: { address: email, name: '' },
      subject: '远效登录密码已重置',
      text: '你的远效登录密码已通过邮箱验证码重置，旧的远效登录已失效。平台绑定、平台登录会话、草稿和任务记录保持不变。\n如果不是本人操作，请立即联系管理员并保护邮箱安全。',
    });
  }
}
