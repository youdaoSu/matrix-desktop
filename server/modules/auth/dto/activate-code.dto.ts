import { IsString, IsNotEmpty } from 'class-validator';

export class ActivateCodeDto {
  @IsString()
  @IsNotEmpty({ message: '激活码不能为空' })
  code!: string;
}
