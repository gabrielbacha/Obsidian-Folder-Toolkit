export const SCHEMA_VERSION = 1;

export const PALETTE_TEMPLATE_IDS = [
	'default', 'sunset-spectrum', 'desert-coast', 'editorial',
	'ocean-depth', 'ember', 'citrus-grove', 'electric-bloom',
] as const;
export type PaletteTemplateId = (typeof PALETTE_TEMPLATE_IDS)[number];

export type ColorChoice =
	| { kind: 'preset'; slot: number }
	| { kind: 'custom'; hex: string }
	| { kind: 'none' };

export interface EffectRule {
	choice: ColorChoice;
	cascade: boolean;
}

export type BorderStyle = 'box' | 'rail';

export interface BorderRule {
	style: BorderStyle;
	color: Exclude<ColorChoice, { kind: 'none' }>;
}

export interface AppearanceRule {
	text?: EffectRule;
	background?: EffectRule;
	border?: BorderRule;
}

export interface FolderToolkitSettings {
	schemaVersion: number;
	paletteTemplateId: PaletteTemplateId;
	tabStyle: 'off' | 'background' | 'border';
	appearanceRules: Record<string, AppearanceRule>;
	hiddenPaths: string[];
	showHiddenItems: boolean;
}

export const DEFAULT_SETTINGS: FolderToolkitSettings = {
	schemaVersion: SCHEMA_VERSION,
	paletteTemplateId: 'default',
	tabStyle: 'off',
	appearanceRules: {},
	hiddenPaths: [],
	showHiddenItems: false,
};
