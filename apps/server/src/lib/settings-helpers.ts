/**
 * Helper utilities for loading settings across different parts of the server
 */

import type { SettingsService } from '../services/settings-service.js';

/**
 * Get the autoLoadClaudeMd setting, with project settings taking precedence over global.
 * Returns false if settings service is not available.
 *
 * @param projectPath - Path to the project
 * @param settingsService - Optional settings service instance
 * @param logPrefix - Prefix for log messages (e.g., '[DescribeImage]')
 * @returns Promise resolving to the autoLoadClaudeMd setting value
 */
export async function getAutoLoadClaudeMdSetting(
  projectPath: string,
  settingsService?: SettingsService,
  logPrefix = '[SettingsHelper]'
): Promise<boolean> {
  if (!settingsService) {
    console.log(`${logPrefix} SettingsService not available, autoLoadClaudeMd disabled`);
    return false;
  }

  try {
    // Check project settings first (takes precedence)
    const projectSettings = await settingsService.getProjectSettings(projectPath);
    if (projectSettings.autoLoadClaudeMd !== undefined) {
      console.log(
        `${logPrefix} autoLoadClaudeMd from project settings: ${projectSettings.autoLoadClaudeMd}`
      );
      return projectSettings.autoLoadClaudeMd;
    }

    // Fall back to global settings
    const globalSettings = await settingsService.getGlobalSettings();
    const result = globalSettings.autoLoadClaudeMd ?? false;
    console.log(`${logPrefix} autoLoadClaudeMd from global settings: ${result}`);
    return result;
  } catch (error) {
    console.error(`${logPrefix} Failed to load autoLoadClaudeMd setting:`, error);
    return false;
  }
}
