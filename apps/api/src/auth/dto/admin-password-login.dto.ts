import { IsString, MinLength } from 'class-validator';

export class AdminPasswordLoginDto {
  @IsString()
  @MinLength(8)
  password!: string;
}
