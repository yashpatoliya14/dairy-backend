import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AppVersionInfo {
  latestVersion: string;
  buildNumber: number;
  minSupportedVersion: string;
  forceUpdate: boolean;
  title: string;
  releaseNotes: string;
  downloadUrl: string;
  apkSize: string;
  publishedAt: string;
}

export interface AppVersionCheckResult extends AppVersionInfo {
  isUpdateAvailable: boolean;
  mustForceUpdate: boolean;
  currentClientVersion?: string;
  currentClientBuildNumber?: number;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private versionConfig: AppVersionInfo;

  constructor(private readonly configService?: ConfigService) {
    this.versionConfig = {
      latestVersion:
        this.configService?.get<string>('APP_LATEST_VERSION') ?? '1.0.34',
      buildNumber: Number(
        this.configService?.get<string>('APP_BUILD_NUMBER') ?? 36,
      ),
      minSupportedVersion:
        this.configService?.get<string>('APP_MIN_SUPPORTED_VERSION') ?? '1.0.34',
      forceUpdate:
        this.configService?.get<string>('APP_FORCE_UPDATE') === 'false'
          ? false
          : true,
      title:
        this.configService?.get<string>('APP_UPDATE_TITLE') ??
        'DairyDesk v1.0.34 Update Available! 🚀',
      releaseNotes:
        this.configService?.get<string>('APP_RELEASE_NOTES') ??
        '• Fixed 10-digit mobile number validation and restricted extra digits\n' +
          '• Standardized WhatsApp as default message channel across the app\n' +
          '• Removed undo prompt in favor of clear success notifications\n' +
          '• Daily Milk Update UI now prominently highlights today\'s collection amount\n' +
          '• Direct dashboard login upon account creation without re-login detour\n' +
          '• Distinct release file: DairyDesk_v1.0.34_Update.apk',
      downloadUrl:
        this.configService?.get<string>('APP_DOWNLOAD_URL') ??
        'https://github.com/yashpatoliya14/dairy/releases/download/v1.0.34/DairyDesk_v1.0.34_Update.apk',
      apkSize: this.configService?.get<string>('APP_APK_SIZE') ?? '60.3 MB',
      publishedAt: new Date().toISOString(),
    };
  }

  getHello(): string {
    return 'Dairy Desk API is running!';
  }

  checkVersion(
    clientVersion?: string,
    clientBuild?: number,
  ): AppVersionCheckResult {
    const isVersionOutdated = clientVersion
      ? this.compareVersions(this.versionConfig.latestVersion, clientVersion) > 0
      : false;
    const isBuildOutdated =
      clientBuild !== undefined
        ? this.versionConfig.buildNumber > clientBuild
        : false;

    const isUpdateAvailable = isVersionOutdated || isBuildOutdated;

    let mustForceUpdate = false;
    if (isUpdateAvailable) {
      if (this.versionConfig.forceUpdate) {
        mustForceUpdate = true;
      } else if (clientVersion) {
        mustForceUpdate =
          this.compareVersions(
            this.versionConfig.minSupportedVersion,
            clientVersion,
          ) > 0;
      }
    }

    return {
      ...this.versionConfig,
      isUpdateAvailable,
      mustForceUpdate,
      currentClientVersion: clientVersion,
      currentClientBuildNumber: clientBuild,
    };
  }

  updateVersionConfig(updates: Partial<AppVersionInfo>): AppVersionInfo {
    this.versionConfig = {
      ...this.versionConfig,
      ...updates,
      publishedAt: new Date().toISOString(),
    };
    this.logger.log(
      `App version config updated: ${JSON.stringify(this.versionConfig)}`,
    );
    return this.versionConfig;
  }

  findLocalApkPath(): string | null {
    const candidatePaths = [
      path.resolve(process.cwd(), 'release', 'app-release.apk'),
      path.resolve(process.cwd(), 'public', 'app-release.apk'),
      path.resolve(process.cwd(), 'uploads', 'app-release.apk'),
      path.resolve(process.cwd(), '..', 'dairy', 'release', 'app-release.apk'),
      path.resolve(
        process.cwd(),
        '..',
        'dairy',
        'build',
        'app',
        'outputs',
        'flutter-apk',
        'app-release.apk',
      ),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map((p) => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map((p) => parseInt(p, 10) || 0);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
      const a = parts1[i] ?? 0;
      const b = parts2[i] ?? 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }
}
