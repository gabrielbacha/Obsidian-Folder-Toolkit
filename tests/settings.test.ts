import { describe, expect, it } from 'vitest';
import { normalizeSettings } from '../src/settings';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../src/types';

describe('settings normalization', () => {
	it('returns isolated defaults for malformed data', () => {
		const settings = normalizeSettings(null);
		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(settings).not.toBe(DEFAULT_SETTINGS);
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

	it('preserves legacy border appearance and normalizes new border options', () => {
		const normalized = normalizeSettings({
			appearanceRules: {
				LegacyBox: { border: { style: 'box', color: { kind: 'preset', slot: 1 } } },
				LegacyRail: { border: { style: 'rail', color: { kind: 'preset', slot: 2 } } },
				Modern: { border: { style: 'rail', color: { kind: 'preset', slot: 3 }, thickness: 'thick', shade: true, scope: 'both' } },
				Blocker: { border: { style: 'box', color: { kind: 'none' }, thickness: 'medium', scope: 'both' } },
			},
		});
		expect(normalized.appearanceRules.LegacyBox?.border).toMatchObject({ thickness: 'thin', shade: false, scope: 'self' });
		expect(normalized.appearanceRules.LegacyRail?.border).toMatchObject({ thickness: 'medium', shade: false, scope: 'self' });
		expect(normalized.appearanceRules.Modern?.border).toMatchObject({ thickness: 'thick', shade: true, scope: 'both' });
		expect(normalized.appearanceRules.Blocker?.border?.color).toEqual({ kind: 'none' });
	});
});
