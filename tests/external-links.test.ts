import { describe, expect, it } from 'vitest';
import { ABOUT_AND_FEEDBACK, BUG_REPORT_URL, FEATURE_REQUEST_URL, MORE_PLUGINS_URL, WEBSITE_URL } from '../src/external-links';

describe('external links', () => {
  it('uses the exact visible labels and copy', () => {
    expect(ABOUT_AND_FEEDBACK).toEqual({
      heading: 'About and feedback',
      name: 'Folder Toolkit by Mindful Apps',
      description: 'Explore more tools at mindfulapps.xyz.',
      websiteLabel: 'Visit website',
      morePluginsLabel: 'More plugins',
      featureRequestLabel: 'Request a feature',
      bugReportLabel: 'Report a bug',
    });
  });

  it('uses the exact tracked website destination', () => {
    expect(WEBSITE_URL).toBe('https://mindfulapps.xyz/folder-toolkit/?utm_source=obsidian_app&utm_medium=referral&utm_campaign=obsidian_assets&utm_content=folder_toolkit_settings');
  });

  it('uses preselected GitHub issue forms', () => {
    expect(FEATURE_REQUEST_URL).toBe('https://github.com/gabrielbacha/Obsidian-Folder-Toolkit/issues/new?template=feature_request.yml');
    expect(MORE_PLUGINS_URL).toBe('https://mindfulapps.xyz/obsidian/?utm_source=obsidian_app&utm_medium=referral&utm_campaign=obsidian_assets');
    expect(BUG_REPORT_URL).toBe('https://github.com/gabrielbacha/Obsidian-Folder-Toolkit/issues/new?template=bug_report.yml');
  });
});
