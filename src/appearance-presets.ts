import type { AppearanceRule, ColorChoice, DescendantRule } from './types';

export interface AppearancePresetDefinition<Id extends string> {
	id: Id;
	label: string;
	description: string;
}

/** Presets that style the folder row itself: background, border, and label. */
export const FOLDER_APPEARANCE_PRESETS = [
	{
		id: 'grouping-folder',
		label: 'Grouping folder',
		description: 'Palette-matched background, label, and box.',
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
		description: 'Yellow background and label.',
	},
	{
		id: 'attention',
		label: 'Attention',
		description: 'Bold red label with a light red background.',
	},
	{
		id: 'muted',
		label: 'Muted',
		description: 'Soft gray background.',
	},
	{
		id: 'archived',
		label: 'Archived',
		description: 'Gray label, no background.',
	},
] as const satisfies readonly AppearancePresetDefinition<string>[];

/** Presets that control how a folder's style reaches its subfolders and notes. */
export const SUBFOLDER_APPEARANCE_PRESETS = [
	{
		id: 'folder-only',
		label: 'Folder only',
		description: 'Colors stay on the folder row. Subfolders get no style.',
	},
	{
		id: 'inherit-colors',
		label: 'Inherit colors',
		description: 'Subfolders and notes take the folder background and label colors.',
	},
	{
		id: 'rails',
		label: 'Subfolder rails',
		description: 'Each direct subfolder gets a thin rail in the next palette color.',
	},
	{
		id: 'shaded-rails',
		label: 'Shaded rails',
		description: 'Thin palette rails with a light tint inside each direct subfolder.',
	},
	{
		id: 'boxes',
		label: 'Subfolder boxes',
		description: 'Each direct subfolder gets a thin box in the next palette color.',
	},
	{
		id: 'shaded-boxes',
		label: 'Shaded boxes',
		description: 'Thin palette boxes with a light tint inside each direct subfolder.',
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
export type SubfolderAppearancePresetId = (typeof SUBFOLDER_APPEARANCE_PRESETS)[number]['id'];

/** The part of a folder rule that reaches below the folder row. */
export interface SubfolderAppearanceState {
	descendants?: DescendantRule;
	textCascade: boolean;
	backgroundCascade: boolean;
}

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

/**
 * Builds the folder-row part of a folder preset. It never cascades and never
 * sets subfolder styling; combine it with {@link withSubfolderAppearance}.
 */
export function createFolderAppearancePreset(id: FolderAppearancePresetId, paletteSlot: number): AppearanceRule {
	switch (id) {
		case 'grouping-folder':
			return {
				background: { choice: paletteChoice(paletteSlot, 14), cascade: false },
				border: { style: 'box', color: paletteChoice(paletteSlot, 42), thickness: 'thin' },
				text: { color: paletteChoice(paletteSlot, 100), bold: false, strikethrough: false, cascade: false },
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
				background: { choice: customChoice(HIGHLIGHT_YELLOW, 20), cascade: false },
				text: { color: customChoice(HIGHLIGHT_YELLOW, 100), bold: false, strikethrough: false, cascade: false },
			};
		case 'attention':
			return {
				background: { choice: customChoice(ATTENTION_RED, 14), cascade: false },
				text: { color: customChoice(ATTENTION_RED, 100), bold: true, strikethrough: false, cascade: false },
			};
		case 'muted':
			return {
				background: { choice: customChoice(MUTED_GRAY, 16), cascade: false },
			};
		case 'archived':
			return {
				text: { color: customChoice(MUTED_GRAY, 100), bold: false, strikethrough: false, cascade: false },
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

export function createSubfolderAppearancePreset(id: SubfolderAppearancePresetId): SubfolderAppearanceState {
	switch (id) {
		case 'folder-only':
			return { textCascade: false, backgroundCascade: false };
		case 'inherit-colors':
			return { textCascade: true, backgroundCascade: true };
		case 'rails':
			return { descendants: { enabled: true, style: 'rail', thickness: 'thin', shading: false }, textCascade: false, backgroundCascade: false };
		case 'shaded-rails':
			return { descendants: { enabled: true, style: 'rail', thickness: 'thin', shading: true }, textCascade: false, backgroundCascade: false };
		case 'boxes':
			return { descendants: { enabled: true, style: 'box', thickness: 'thin', shading: false }, textCascade: false, backgroundCascade: false };
		case 'shaded-boxes':
			return { descendants: { enabled: true, style: 'box', thickness: 'thin', shading: true }, textCascade: false, backgroundCascade: false };
	}
}

/** Returns a copy of `rule` whose subfolder styling and cascade flags come from `state`. Folder-row styling is kept. */
export function withSubfolderAppearance(rule: AppearanceRule, state: SubfolderAppearanceState): AppearanceRule {
	const next = structuredClone(rule);
	if (next.text) next.text.cascade = state.textCascade;
	if (next.background) next.background.cascade = state.backgroundCascade;
	if (state.descendants) next.descendants = structuredClone(state.descendants);
	else delete next.descendants;
	return next;
}

export function paletteSlotsUsedByAppearance(rule: AppearanceRule | undefined): number[] {
	if (!rule) return [];
	const slots = new Set<number>();
	if (rule.background?.choice.kind === 'preset') slots.add(rule.background.choice.slot);
	if (rule.text?.color?.kind === 'preset') slots.add(rule.text.color.slot);
	if (rule.border && !('kind' in rule.border) && rule.border.color.kind === 'preset') slots.add(rule.border.color.slot);
	return [...slots];
}
