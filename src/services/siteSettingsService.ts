import SiteSettings, { ISiteSettings } from "../models/siteSettings";

class SiteSettingsService {
  async getSettings() {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      // Create default settings if none exist
      settings = await SiteSettings.create({});
    }
    return settings;
  }

  async updateSettings(settingsData: Partial<ISiteSettings>) {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      settings = await SiteSettings.create(settingsData);
    } else {
      settings = await SiteSettings.findOneAndUpdate({}, settingsData, {
        new: true,
        runValidators: true,
      });
    }
    return settings;
  }
}

export const siteSettingsService = new SiteSettingsService();
