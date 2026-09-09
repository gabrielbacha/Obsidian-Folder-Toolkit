import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../src/settings';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../src/types';

describe('settings normalization', () => {
	it('returns isolated defaults for malformed data', () => {
		const settings = normalizeSettings(null);
		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(settings).not.toBe(DEFAULT_SETTINGS);
		expect(settings.conditionalFormats.map((rule) => rule.pattern)).toEqual(["__system", "__archive", "_basefiles"]);
		expect(settings.conditionalFormats.every((rule) => rule.fontEnabled && !rule.backgroundEnabled)).toBe(true);
		expect(settings.conditionalFormats.every((rule) => rule.color.kind === 'custom'
			&& rule.color.hex === '#C8C8C8'
			&& rule.color.strength === 100)).toBe(true);
		const migrated = normalizeSettings({ schemaVersion: 2, conditionalFormats: [] });
		expect(migrated.conditionalFormats.map((rule) => rule.pattern))
			.toEqual(['__system', '__archive', '_basefiles']);
		const migratedWithBackground = normalizeSettings({
			schemaVersion: 2,
			conditionalFormats: [{
				id: 'existing-system-background', target: 'folder', match: 'equals', pattern: '__system',
				background: { kind: 'custom', hex: '#CCCCCC' },
			}],
		});
		expect(migratedWithBackground.conditionalFormats
			.filter((rule) => rule.pattern === '__system')
			.map((rule) => [rule.fontEnabled, rule.backgroundEnabled])).toEqual([[true, false], [false, true]]);
	});

	it('normalizes color strength for custom and palette colors', () => {
		const settings = normalizeSettings({
			appearanceRules: {
				A: { text: { color: { kind: 'custom', hex: '#123456', strength: 42 }, bold: false, strikethrough: false, cascade: false } },
				B: { text: { color: { kind: 'preset', slot: 1, strength: 140 }, bold: false, strikethrough: false, cascade: false } },
			},
		});
		expect(settings.appearanceRules.A?.text?.color).toEqual({ kind: 'custom', hex: '#123456', strength: 42 });
		expect(settings.appearanceRules.B?.text?.color).toEqual({ kind: 'preset', slot: 1, strength: 100 });
	});

	it('normalizes colors, removes malformed rules, and deduplicates hidden paths', () => {
		const settings = normalizeSettings({
			schemaVersion: 99,
			paletteTemplateId: 'ember',
			appearanceRules: {
				A: { text: { color: { kind: 'custom', hex: 'abc' }, bold: false, strikethrough: false, cascade: true } },
				B: { background: { choice: { kind: 'preset', slot: -2 }, cascade: false } },
			},
			hiddenPaths: ['A', 'A', 7, ''],
			showHiddenItems: true,
		});
		expect(settings.schemaVersion).toBe(SCHEMA_VERSION);
		expect(settings.appearanceRules.A?.text?.color).toEqual({ kind: 'custom', hex: '#AABBCC' });
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
			schemaVersion: 3,
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
			fontEnabled: false,
			color: { kind: 'custom', hex: '#A8ADB5', strength: 100 },
			backgroundEnabled: true,
			backgroundColor: { kind: 'custom', hex: '#A8ADB5', strength: 100 },
			bold: false,
			strikethrough: false,
		}]);
	});

	it('normalizes rules with both font and background colors and typography', () => {
		const settings = normalizeSettings({
			schemaVersion: 3,
			conditionalFormats: [
				{
					id: 'archive-rule',
					target: 'both',
					match: 'startsWith',
					pattern: '__archive',
					effect: 'both',
					color: { kind: 'custom', hex: '#ffffff', strength: 100 },
					backgroundColor: { kind: 'custom', hex: '#222222', strength: 40 },
					bold: true,
					strikethrough: true,
				},
			],
		});
		expect(settings.conditionalFormats).toEqual([{
			id: 'archive-rule',
			target: 'both',
			match: 'startsWith',
			pattern: '__archive',
			fontEnabled: true,
			color: { kind: 'custom', hex: '#FFFFFF', strength: 100 },
			backgroundEnabled: true,
			backgroundColor: { kind: 'custom', hex: '#222222', strength: 40 },
			bold: true,
			strikethrough: true,
		}]);
	});

	it("migrates schema-4 direct text effects without changing their appearance", () => {
		const settings = normalizeSettings({
			schemaVersion: 4,
			appearanceRules: {
				Legacy: { text: { choice: { kind: "custom", hex: "#abc", strength: 55 }, cascade: true } },
			},
		});
		expect(settings.schemaVersion).toBe(5);
		expect(settings.appearanceRules.Legacy?.text).toEqual({
			color: { kind: "custom", hex: "#AABBCC", strength: 55 },
			bold: false,
			strikethrough: false,
			cascade: true,
		});
	});

});
