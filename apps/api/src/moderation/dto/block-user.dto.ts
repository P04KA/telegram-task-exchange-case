import { IsString, MinLength } from 'class-validator';

export class BlockUserDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
