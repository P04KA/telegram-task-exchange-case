import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppJwtPayload } from '../types/auth';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AppJwtPayload => {
    const request = context.switchToHttp().getRequest();
    return request.user as AppJwtPayload;
  },
);
