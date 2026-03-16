import { IsUUID } from 'class-validator';

export class CreateExecutionDto {
  @IsUUID()
  taskId!: string;
}
