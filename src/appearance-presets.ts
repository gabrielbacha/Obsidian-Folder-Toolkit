import type { AppearanceRule, ColorChoice } from './types';

export const FOLDER_APPEARANCE_PRESETS = [
	{
		id: 'grouping-folder',
		label: 'Grouping folder',
		description: 'Palette-matched background, label, box, and shaded subfolder rails.',
	},
	{
		id: 'muted',
		label: 'Muted',
		description: 'Soft gray background across the folder and its descendants.',
	},
	{
		id: 'highlight',
		label: 'Highlight',
		description: 'Yellow background and label across the folder and its descendants.',
	},
	{
		id: 'section-rail',
		label: 'Section rail',
		description: 'Palette-colored label with a medium vertical rail.',
	},
	{
		id: 'minimal-label',
		label: 'Minimal label',
		description: 'Bold palette-colored label without a background or border.',
	},
] as const;

export type FolderAppearancePresetId = (typeof FOLDER_APPEARANCE_PRESETS)[number]['id'];

function paletteChoice(slot: number, strength: number): Exclude<ColorChoice, { kind: 'none' }> {
	return { kind: 'preset', slot, strength };
}

export function createFolderAppearancePreset(id: FolderAppearancePresetId, paletteSlot: number): AppearanceRule {
	switch (id) {
		case 'grouping-folder':
			return {
				background: { choice: paletteChoice(paletteSlot, 14), cascade: false },
				border: { style: 'box', color: paletteChoice(paletteSlot, 42), thickness: 'thin' },
				text: { color: paletteChoice(paletteSlot, 100), bold: false, strikethrough: false, cascade: false },
				descendants: { enabled: true, style: 'rail', thickness: 'thin', shading: true },
			};
		case 'muted':
			return {
				background: { choice: { kind: 'custom', hex: '#A8ADB5', strength: 16 }, cascade: true },
			};
		case 'highlight':
			return {
				background: { choice: { kind: 'custom', hex: '#F1C40F', strength: 20 }, cascade: true },
				text: { color: { kind: 'custom', hex: '#F1C40F', strength: 100 }, bold: false, strikethrough: false, cascade: true },
			};
		case 'section-rail':
			return {
				border: { style: 'rail', color: paletteChoice(paletteSlot, 55), thickness: 'medium' },
				text: { color: paletteChoice(paletteSlot, 100), bold: false, strikethrough: false, cascade: false },
			};
		case 'minimal-label':
			return {
				text: { color: paletteChoice(paletteSlot, 100), bold: true, strikethrough: false, cascade: false },
			};
	}
}

export function paletteSlotsUsedByAppearance(rule: AppearanceRule | undefined): number[] {
	if (!rule) return [];
	const slots = new Set<number>();
	if (rule.background?.choice.kind === 'preset') slots.add(rule.background.choice.slot);
	if (rule.text?.color?.kind === 'preset') slots.add(rule.text.color.slot);
	if (rule.border && !('kind' in rule.border) && rule.border.color.kind === 'preset') slots.add(rule.border.color.slot);
	return [...slots];
}
