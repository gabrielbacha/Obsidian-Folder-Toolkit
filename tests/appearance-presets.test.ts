import { describe, expect, it } from 'vitest';
import { createFileAppearancePreset, createFolderAppearancePreset, FILE_APPEARANCE_PRESETS, FOLDER_APPEARANCE_PRESETS, paletteSlotsUsedByAppearance } from '../src/appearance-presets';

describe('folder appearance presets', () => {
	it('ships eight folder presets ordered from structural to status styles', () => {
		expect(FOLDER_APPEARANCE_PRESETS.map((preset) => preset.id)).toEqual([
			'grouping-folder', 'shaded-box', 'section-rail', 'minimal-label', 'highlight', 'attention', 'muted', 'archived',
		]);
	});

	it('ships eight file presets', () => {
		expect(FILE_APPEARANCE_PRESETS.map((preset) => preset.id)).toEqual([
			'important', 'index-note', 'tinted', 'highlight', 'attention', 'draft', 'done', 'muted',
		]);
	});

	it('builds structural folder presets without label colors where appropriate', () => {
		expect(createFolderAppearancePreset('shaded-box', 2)).toEqual({
			border: { style: 'box', color: { kind: 'preset', slot: 2, strength: 42 }, thickness: 'thin', shading: true },
		});
		expect(createFolderAppearancePreset('attention', 0)).toEqual({
			background: { choice: { kind: 'custom', hex: '#C0392B', strength: 14 }, cascade: false },
			text: { color: { kind: 'custom', hex: '#C0392B', strength: 100 }, bold: true, strikethrough: false, cascade: false },
		});
		expect(createFolderAppearancePreset('archived', 0)).toEqual({
			text: { color: { kind: 'custom', hex: '#A8ADB5', strength: 100 }, bold: false, strikethrough: false, cascade: true },
		});
	});

	it('builds file presets that never cascade and never set descendant rules', () => {
		for (const preset of FILE_APPEARANCE_PRESETS) {
			const rule = createFileAppearancePreset(preset.id, 3);
			expect(rule.descendants).toBeUndefined();
			expect(rule.background?.cascade ?? false).toBe(false);
			expect(rule.text?.cascade ?? false).toBe(false);
		}
		expect(createFileAppearancePreset('important', 3)).toEqual({
			background: { choice: { kind: 'preset', slot: 3, strength: 14 }, cascade: false },
			text: { color: { kind: 'preset', slot: 3, strength: 100 }, bold: true, strikethrough: false, cascade: false },
		});
		expect(createFileAppearancePreset('index-note', 1)).toEqual({
			border: { style: 'box', color: { kind: 'preset', slot: 1, strength: 42 }, thickness: 'thin' },
			text: { color: { kind: 'preset', slot: 1, strength: 100 }, bold: true, strikethrough: false, cascade: false },
		});
		expect(createFileAppearancePreset('tinted', 4)).toEqual({
			background: { choice: { kind: 'preset', slot: 4, strength: 14 }, cascade: false },
		});
		expect(createFileAppearancePreset('done', 0)).toEqual({
			text: { color: { kind: 'custom', hex: '#A8ADB5', strength: 100 }, bold: false, strikethrough: true, cascade: false },
		});
		expect(createFileAppearancePreset('draft', 0)).toMatchObject({
			text: { color: { kind: 'custom', hex: '#E67E22' }, bold: false },
		});
	});

	it('builds a non-cascading grouping style from one palette slot', () => {
		const preset = createFolderAppearancePreset('grouping-folder', 3);
		expect(preset).toEqual({
			background: { choice: { kind: 'preset', slot: 3, strength: 14 }, cascade: false },
			border: { style: 'box', color: { kind: 'preset', slot: 3, strength: 42 }, thickness: 'thin' },
			text: { color: { kind: 'preset', slot: 3, strength: 100 }, bold: false, strikethrough: false, cascade: false },
			descendants: { enabled: true, style: 'rail', thickness: 'thin', shading: true },
		});
	});

	it('keeps muted and highlight treatments cascading while simpler presets do not', () => {
		expect(createFolderAppearancePreset('muted', 0)).toEqual({
			background: { choice: { kind: 'custom', hex: '#A8ADB5', strength: 16 }, cascade: true },
		});
		expect(createFolderAppearancePreset('highlight', 0)).toMatchObject({
			background: { choice: { kind: 'custom', hex: '#F1C40F', strength: 20 }, cascade: true },
			text: { color: { kind: 'custom', hex: '#F1C40F', strength: 100 }, cascade: true },
		});
		expect(createFolderAppearancePreset('section-rail', 4)).toMatchObject({
			border: { style: 'rail', color: { kind: 'preset', slot: 4 }, thickness: 'medium' },
			text: { color: { kind: 'preset', slot: 4 }, cascade: false },
		});
		expect(createFolderAppearancePreset('minimal-label', 5)).toMatchObject({
			text: { color: { kind: 'preset', slot: 5 }, bold: true, cascade: false },
		});
	});

	it('collects unique palette slots across all styled channels', () => {
		expect(paletteSlotsUsedByAppearance({
			background: { choice: { kind: 'preset', slot: 2 }, cascade: false },
			text: { color: { kind: 'preset', slot: 2 }, bold: false, strikethrough: false, cascade: false },
			border: { style: 'box', color: { kind: 'preset', slot: 4 } },
		})).toEqual([2, 4]);
	});
});
