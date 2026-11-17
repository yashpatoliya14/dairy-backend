import { describe, it, expect, beforeEach } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  let appService: AppService;

  beforeEach(() => {
    appService = new AppService();
    appController = new AppController(appService);
  });

  describe('root', () => {
    it('should return API status', () => {
      expect(appController.getHello()).toContain('Dairy Desk API');
    });
  });

  describe('version check', () => {
    it('detects update available when client version is older than latest', () => {
      const res = appController.getAppVersion('1.0.21', '23');
      expect(res.isUpdateAvailable).toBe(true);
      expect(res.mustForceUpdate).toBe(true);
      expect(res.latestVersion).toBe('1.0.22');
      expect(res.downloadUrl).toContain('app-release.apk');
    });

    it('returns isUpdateAvailable false when client is on latest version', () => {
      const res = appController.getAppVersion('1.0.22', '24');
      expect(res.isUpdateAvailable).toBe(false);
      expect(res.mustForceUpdate).toBe(false);
    });

    it('allows updating version configuration dynamically', () => {
      const updated = appController.updateVersionConfig({
        latestVersion: '1.0.23',
        buildNumber: 25,
        forceUpdate: false,
        minSupportedVersion: '1.0.1',
      });

      expect(updated.latestVersion).toBe('1.0.23');
      expect(updated.buildNumber).toBe(25);
      expect(updated.forceUpdate).toBe(false);

      const check = appController.getAppVersion('1.0.22', '24');
      expect(check.isUpdateAvailable).toBe(true);
      expect(check.mustForceUpdate).toBe(false);
    });
  });
});
