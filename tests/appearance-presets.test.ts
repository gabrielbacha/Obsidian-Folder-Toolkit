import { describe, expect, it } from 'vitest';
import {
	createFileAppearancePreset,
	createFolderAppearancePreset,
	createSubfolderAppearancePreset,
	FILE_APPEARANCE_PRESETS,
	FOLDER_APPEARANCE_PRESETS,
	paletteSlotsUsedByAppearance,
	SUBFOLDER_APPEARANCE_PRESETS,
	withSubfolderAppearance,
} from '../src/appearance-presets';

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
			text: { color: { kind: 'custom', hex: '#A8ADB5', strength: 100 }, bold: false, strikethrough: false, cascade: false },
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

	it('builds a grouping style from one palette slot without subfolder styling', () => {
		const preset = createFolderAppearancePreset('grouping-folder', 3);
		expect(preset).toEqual({
			background: { choice: { kind: 'preset', slot: 3, strength: 14 }, cascade: false },
			border: { style: 'box', color: { kind: 'preset', slot: 3, strength: 42 }, thickness: 'thin' },
			text: { color: { kind: 'preset', slot: 3, strength: 100 }, bold: false, strikethrough: false, cascade: false },
		});
	});

	it('keeps every folder preset on the folder row', () => {
		for (const preset of FOLDER_APPEARANCE_PRESETS) {
			const rule = createFolderAppearancePreset(preset.id, 2);
			expect(rule.descendants).toBeUndefined();
			expect(rule.background?.cascade ?? false).toBe(false);
			expect(rule.text?.cascade ?? false).toBe(false);
		}
		expect(createFolderAppearancePreset('muted', 0)).toEqual({
			background: { choice: { kind: 'custom', hex: '#A8ADB5', strength: 16 }, cascade: false },
		});
		expect(createFolderAppearancePreset('highlight', 0)).toMatchObject({
			background: { choice: { kind: 'custom', hex: '#F1C40F', strength: 20 } },
			text: { color: { kind: 'custom', hex: '#F1C40F', strength: 100 } },
		});
		expect(createFolderAppearancePreset('section-rail', 4)).toMatchObject({
			border: { style: 'rail', color: { kind: 'preset', slot: 4 }, thickness: 'medium' },
			text: { color: { kind: 'preset', slot: 4 }, cascade: false },
		});
		expect(createFolderAppearancePreset('minimal-label', 5)).toMatchObject({
			text: { color: { kind: 'preset', slot: 5 }, bold: true, cascade: false },
		});
	});

	it('ships subfolder presets that only describe descendant styling and cascading', () => {
		expect(SUBFOLDER_APPEARANCE_PRESETS.map((preset) => preset.id)).toEqual([
			'folder-only', 'inherit-colors', 'rails', 'shaded-rails', 'boxes', 'shaded-boxes',
		]);
		expect(createSubfolderAppearancePreset('folder-only')).toEqual({ textCascade: false, backgroundCascade: false });
		expect(createSubfolderAppearancePreset('inherit-colors')).toEqual({ textCascade: true, backgroundCascade: true });
		expect(createSubfolderAppearancePreset('shaded-rails')).toEqual({
			descendants: { enabled: true, style: 'rail', thickness: 'thin', shading: true },
			textCascade: false,
			backgroundCascade: false,
		});
	});

	it('replaces only the subfolder part of a folder rule', () => {
		const folderRow = createFolderAppearancePreset('grouping-folder', 1);
		const withRails = withSubfolderAppearance(folderRow, createSubfolderAppearancePreset('rails'));
		expect(withRails).toEqual({ ...folderRow, descendants: { enabled: true, style: 'rail', thickness: 'thin', shading: false } });
		const inherited = withSubfolderAppearance(withRails, createSubfolderAppearancePreset('inherit-colors'));
		expect(inherited.descendants).toBeUndefined();
		expect(inherited.background?.cascade).toBe(true);
		expect(inherited.text?.cascade).toBe(true);
		expect(inherited.border).toEqual(folderRow.border);
		expect(folderRow.descendants).toBeUndefined();
	});

	it('collects unique palette slots across all styled channels', () => {
		expect(paletteSlotsUsedByAppearance({
			background: { choice: { kind: 'preset', slot: 2 }, cascade: false },
			text: { color: { kind: 'preset', slot: 2 }, bold: false, strikethrough: false, cascade: false },
			border: { style: 'box', color: { kind: 'preset', slot: 4 } },
		})).toEqual([2, 4]);
	});
});
