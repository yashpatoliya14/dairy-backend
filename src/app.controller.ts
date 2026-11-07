import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  AppService,
} from './app.service.js';
import type {
  AppVersionCheckResult,
  AppVersionInfo,
} from './app.service.js';
import type { Response as ExpressResponse } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('app/version')
  getAppVersion(
    @Query('currentVersion') currentVersion?: string,
    @Query('buildNumber') buildNumber?: string,
  ): AppVersionCheckResult {
    const buildNum =
      buildNumber !== undefined ? parseInt(buildNumber, 10) : undefined;
    return this.appService.checkVersion(currentVersion, buildNum);
  }

  @Get('app/download-latest')
  downloadLatestApk(@Res() res: ExpressResponse): void {
    const apkPath = this.appService.findLocalApkPath();
    if (apkPath) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.download(apkPath, 'DairyDesk_latest.apk');
      return;
    }

    const config = this.appService.checkVersion();
    if (config.downloadUrl && config.downloadUrl !== '/app/download-latest') {
      res.redirect(302, config.downloadUrl);
      return;
    }

    res.status(404).json({
      error: 'APK not found',
      message:
        'Latest APK is not hosted directly on this instance. Please configure APP_DOWNLOAD_URL.',
    });
  }

  @Post('app/version')
  updateVersionConfig(@Body() body: Record<string, any>): AppVersionInfo {
    return this.appService.updateVersionConfig(body);
  }
}
