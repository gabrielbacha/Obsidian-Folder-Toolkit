import { describe, expect, it } from 'vitest';
import { createFolderAppearancePreset, FOLDER_APPEARANCE_PRESETS, paletteSlotsUsedByAppearance } from '../src/appearance-presets';

describe('folder appearance presets', () => {
	it('ships five focused presets', () => {
		expect(FOLDER_APPEARANCE_PRESETS.map((preset) => preset.id)).toEqual([
			'grouping-folder', 'muted', 'highlight', 'section-rail', 'minimal-label',
		]);
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
