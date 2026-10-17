import { Body, Get, Patch, Req, UseGuards, Controller } from '@nestjs/common';
import { IsNumber, IsOptional, Min } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { SettingsService } from './settings.service.js';

class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultLiters?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPrice?: number;
}

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.settingsService.get(request.user.sub);
  }

  @Patch()
  update(@Req() request: AuthenticatedRequest, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(request.user.sub, dto);
  }
}
