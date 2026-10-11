import type { AppearanceRule, ColorChoice } from './types';

export interface AppearancePresetDefinition<Id extends string> {
	id: Id;
	label: string;
	description: string;
}

export const FOLDER_APPEARANCE_PRESETS = [
	{
		id: 'grouping-folder',
		label: 'Grouping folder',
		description: 'Palette-matched background, label, box, and shaded subfolder rails.',
	},
	{
		id: 'shaded-box',
		label: 'Shaded box',
		description: 'Thin palette box with a light tint over the whole subtree, no label color.',
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
	{
		id: 'highlight',
		label: 'Highlight',
		description: 'Yellow background and label across the folder and its descendants.',
	},
	{
		id: 'attention',
		label: 'Attention',
		description: 'Bold red label with a light red background on the folder row.',
	},
	{
		id: 'muted',
		label: 'Muted',
		description: 'Soft gray background across the folder and its descendants.',
	},
	{
		id: 'archived',
		label: 'Archived',
		description: 'Gray label and gray descendant text, no background.',
	},
] as const satisfies readonly AppearancePresetDefinition<string>[];

export const FILE_APPEARANCE_PRESETS = [
	{
		id: 'important',
		label: 'Important',
		description: 'Bold palette-colored label on a light matching background.',
	},
	{
		id: 'index-note',
		label: 'Index note',
		description: 'Bold palette-colored label inside a thin box, for hub or map-of-content notes.',
	},
	{
		id: 'tinted',
		label: 'Tinted',
		description: 'Light palette background only, label color stays automatic.',
	},
	{
		id: 'highlight',
		label: 'Highlight',
		description: 'Yellow background and label.',
	},
	{
		id: 'attention',
		label: 'Attention',
		description: 'Bold red label with a light red background.',
	},
	{
		id: 'draft',
		label: 'Draft',
		description: 'Orange label for work in progress.',
	},
	{
		id: 'done',
		label: 'Done',
		description: 'Gray label with strikethrough.',
	},
	{
		id: 'muted',
		label: 'Muted',
		description: 'Gray label without a background.',
	},
] as const satisfies readonly AppearancePresetDefinition<string>[];

export type FolderAppearancePresetId = (typeof FOLDER_APPEARANCE_PRESETS)[number]['id'];
export type FileAppearancePresetId = (typeof FILE_APPEARANCE_PRESETS)[number]['id'];

const MUTED_GRAY = '#A8ADB5';
const HIGHLIGHT_YELLOW = '#F1C40F';
const ATTENTION_RED = '#C0392B';
const DRAFT_ORANGE = '#E67E22';

function paletteChoice(slot: number, strength: number): Exclude<ColorChoice, { kind: 'none' }> {
	return { kind: 'preset', slot, strength };
}

function customChoice(hex: string, strength: number): Exclude<ColorChoice, { kind: 'none' }> {
	return { kind: 'custom', hex, strength };
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
		case 'shaded-box':
			return {
				border: { style: 'box', color: paletteChoice(paletteSlot, 42), thickness: 'thin', shading: true },
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
		case 'highlight':
			return {
				background: { choice: customChoice(HIGHLIGHT_YELLOW, 20), cascade: true },
				text: { color: customChoice(HIGHLIGHT_YELLOW, 100), bold: false, strikethrough: false, cascade: true },
			};
		case 'attention':
			return {
				background: { choice: customChoice(ATTENTION_RED, 14), cascade: false },
				text: { color: customChoice(ATTENTION_RED, 100), bold: true, strikethrough: false, cascade: false },
			};
		case 'muted':
			return {
				background: { choice: customChoice(MUTED_GRAY, 16), cascade: true },
			};
		case 'archived':
			return {
				text: { color: customChoice(MUTED_GRAY, 100), bold: false, strikethrough: false, cascade: true },
			};
	}
}

export function createFileAppearancePreset(id: FileAppearancePresetId, paletteSlot: number): AppearanceRule {
	switch (id) {
		case 'important':
			return {
				background: { choice: paletteChoice(paletteSlot, 14), cascade: false },
				text: { color: paletteChoice(paletteSlot, 100), bold: true, strikethrough: false, cascade: false },
			};
		case 'index-note':
			return {
				border: { style: 'box', color: paletteChoice(paletteSlot, 42), thickness: 'thin' },
				text: { color: paletteChoice(paletteSlot, 100), bold: true, strikethrough: false, cascade: false },
			};
		case 'tinted':
			return {
				background: { choice: paletteChoice(paletteSlot, 14), cascade: false },
			};
		case 'highlight':
			return {
				background: { choice: customChoice(HIGHLIGHT_YELLOW, 20), cascade: false },
				text: { color: customChoice(HIGHLIGHT_YELLOW, 100), bold: false, strikethrough: false, cascade: false },
			};
		case 'attention':
			return {
				background: { choice: customChoice(ATTENTION_RED, 14), cascade: false },
				text: { color: customChoice(ATTENTION_RED, 100), bold: true, strikethrough: false, cascade: false },
			};
		case 'draft':
			return {
				text: { color: customChoice(DRAFT_ORANGE, 100), bold: false, strikethrough: false, cascade: false },
			};
		case 'done':
			return {
				text: { color: customChoice(MUTED_GRAY, 100), bold: false, strikethrough: true, cascade: false },
			};
		case 'muted':
			return {
				text: { color: customChoice(MUTED_GRAY, 100), bold: false, strikethrough: false, cascade: false },
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
