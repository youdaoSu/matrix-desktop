import { IsEmail, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordRecoveryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username!: string;

  @IsEmail({}, { message: '请输入有效的已绑定邮箱' })
  @MaxLength(254)
  email!: string;
}

export class CompletePasswordRecoveryDto {
  @IsUUID('4', { message: '请先获取验证码' })
  requestId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入6位邮箱验证码' })
  code!: string;

  @IsString()
  @MinLength(10, { message: '新密码至少需要10位' })
  @MaxLength(72, { message: '新密码过长' })
  newPassword!: string;

  @IsString()
  @MaxLength(72)
  confirmPassword!: string;
}
