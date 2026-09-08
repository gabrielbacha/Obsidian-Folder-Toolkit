import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../src/settings';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../src/types';

describe('settings normalization', () => {
	it('returns isolated defaults for malformed data', () => {
		const settings = normalizeSettings(null);
		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(settings).not.toBe(DEFAULT_SETTINGS);
	});

	it('normalizes color strength for custom and palette colors', () => {
		const settings = normalizeSettings({
			appearanceRules: {
				A: { text: { choice: { kind: 'custom', hex: '#123456', strength: 42 }, cascade: false } },
				B: { text: { choice: { kind: 'preset', slot: 1, strength: 140 }, cascade: false } },
			},
		});
		expect(settings.appearanceRules.A?.text?.choice).toEqual({ kind: 'custom', hex: '#123456', strength: 42 });
		expect(settings.appearanceRules.B?.text?.choice).toEqual({ kind: 'preset', slot: 1, strength: 100 });
	});

	it('normalizes colors, removes malformed rules, and deduplicates hidden paths', () => {
		const settings = normalizeSettings({
			schemaVersion: 99,
			paletteTemplateId: 'ember',
			appearanceRules: {
				A: { text: { choice: { kind: 'custom', hex: 'abc' }, cascade: true } },
				B: { background: { choice: { kind: 'preset', slot: -2 }, cascade: false } },
			},
			hiddenPaths: ['A', 'A', 7, ''],
			showHiddenItems: true,
		});
		expect(settings.schemaVersion).toBe(SCHEMA_VERSION);
		expect(settings.appearanceRules.A?.text?.choice).toEqual({ kind: 'custom', hex: '#AABBCC' });
		expect(settings.appearanceRules.B).toBeUndefined();
		expect(settings.hiddenPaths).toEqual(['A']);
		expect(settings.showHiddenItems).toBe(true);
		expect(settings.tabStyle).toBe('off');
	});

	it('accepts only supported open-tab styles', () => {
		expect(normalizeSettings({ tabStyle: 'border' }).tabStyle).toBe('border');
		expect(normalizeSettings({ tabStyle: 'rainbow' }).tabStyle).toBe('off');
	});

	it('normalizes conditional formatting rules and removes malformed entries', () => {
		const settings = normalizeSettings({
			conditionalFormats: [
				{
					id: 'system-folders',
					target: 'folder',
					match: 'equals',
					pattern: '__system',
					background: { kind: 'custom', hex: 'a8adb5', strength: 120 },
				},
				{ id: '', target: 'file', match: 'startsWith', pattern: '__archive', background: { kind: 'none' } },
			],
		});
		expect(settings.conditionalFormats).toEqual([{
			id: 'system-folders',
			target: 'folder',
			match: 'equals',
			pattern: '__system',
			background: { kind: 'custom', hex: '#A8ADB5', strength: 100 },
		}]);
	});

});
