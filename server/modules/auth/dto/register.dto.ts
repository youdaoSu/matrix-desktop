import {
  IsString,
  IsNotEmpty,
  MinLength,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(4, { message: '用户名长度不能少于4位' })
  @MaxLength(50, { message: '用户名长度不能超过50位' })
  username!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码长度不能少于6位' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '昵称长度不能超过100位' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '邮箱长度不能超过255位' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: '手机号长度不能超过20位' })
  phone?: string;
}
