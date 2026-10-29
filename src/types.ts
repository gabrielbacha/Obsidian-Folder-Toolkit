export const SCHEMA_VERSION = 6;

export const PALETTE_TEMPLATE_IDS = [
	'default', 'sunset-spectrum', 'desert-coast', 'editorial',
	'ocean-depth', 'ember', 'citrus-grove', 'electric-bloom',
] as const;
export type PaletteTemplateId = (typeof PALETTE_TEMPLATE_IDS)[number];

export type ColorChoice =
	/** `palette` is runtime only: it is set on rules read from a nested vault, which can use another palette. */
	| { kind: 'preset'; slot: number; strength?: number; palette?: PaletteTemplateId }
	| { kind: 'custom'; hex: string; strength?: number }
	| { kind: 'none' };

export interface EffectRule {
	choice: ColorChoice;
	cascade: boolean;
}

export interface TextAppearanceRule {
	color?: ColorChoice;
	bold: boolean;
	strikethrough: boolean;
	cascade: boolean;
}

export type BorderStyle = 'box' | 'rail';
export type BorderThickness = 'thin' | 'medium' | 'thick';

export interface BorderRule {
	style: BorderStyle;
	color: Exclude<ColorChoice, { kind: 'none' }>;
	thickness?: BorderThickness;
	shading?: boolean;
}

export type BorderAppearanceRule = BorderRule | { kind: 'none' };

export interface DescendantRule {
	enabled: boolean;
	style: BorderStyle;
	thickness?: BorderThickness;
	shading?: boolean;
	/** Runtime only: the palette of the nested vault that owns this rule. */
	palette?: PaletteTemplateId;
}

export interface AppearanceRule {
	text?: TextAppearanceRule;
	background?: EffectRule;
	border?: BorderAppearanceRule;
	descendants?: DescendantRule;
}

export type ConditionalTarget = 'folder' | 'file' | 'both';
export type ConditionalMatch = 'equals' | 'startsWith' | 'endsWith' | 'contains';

export interface ConditionalFormatRule {
	id: string;
	target: ConditionalTarget;
	match: ConditionalMatch;
	pattern: string;
	fontEnabled?: boolean;
	color: Exclude<ColorChoice, { kind: 'none' }>;
	backgroundEnabled?: boolean;
	backgroundColor?: Exclude<ColorChoice, { kind: 'none' }>;
	borderEnabled?: boolean;
	border?: BorderRule;
	bold?: boolean;
	strikethrough?: boolean;
	/** Runtime only: a rule read from a nested vault applies only inside that vault's folder. */
	scope?: string;
}

export const DEFAULT_CONDITIONAL_FORMATS: ConditionalFormatRule[] = [
	{
		id: 'default-system-folders',
		target: 'folder',
		match: 'equals',
		pattern: '__system',
		fontEnabled: true,
		color: { kind: 'custom', hex: '#C8C8C8', strength: 100 },
		backgroundEnabled: false,
		backgroundColor: { kind: 'custom', hex: '#A8ADB5', strength: 20 },
		bold: false,
		strikethrough: false,
	},
	{
		id: 'default-archive-files',
		target: 'file',
		match: 'startsWith',
		pattern: '__archive',
		fontEnabled: true,
		color: { kind: 'custom', hex: '#C8C8C8', strength: 100 },
		backgroundEnabled: false,
		backgroundColor: { kind: 'custom', hex: '#A8ADB5', strength: 20 },
		bold: false,
		strikethrough: false,
	},
	{
		id: 'default-basefiles-folders',
		target: 'folder',
		match: 'endsWith',
		pattern: '_basefiles',
		fontEnabled: true,
		color: { kind: 'custom', hex: '#C8C8C8', strength: 100 },
		backgroundEnabled: false,
		backgroundColor: { kind: 'custom', hex: '#A8ADB5', strength: 20 },
		bold: false,
		strikethrough: false,
	},
];

export interface FolderToolkitSettings {
	schemaVersion: number;
	paletteTemplateId: PaletteTemplateId;
	tabStyle: 'off' | 'background' | 'border';
	appearanceRules: Record<string, AppearanceRule>;
	conditionalFormats: ConditionalFormatRule[];
	hiddenPaths: string[];
	showHiddenItems: boolean;
	/** Read and save folder appearance in the nested vault that owns a folder. */
	nestedVaults: boolean;
	/** How the explorer marks a folder that is itself a vault. */
	vaultMarker: VaultMarker;
}

export const VAULT_MARKERS = ['off', 'icon', 'border', 'both'] as const;
export type VaultMarker = (typeof VAULT_MARKERS)[number];

export const DEFAULT_SETTINGS: FolderToolkitSettings = {
	schemaVersion: SCHEMA_VERSION,
	paletteTemplateId: 'default',
	tabStyle: 'off',
	appearanceRules: {},
	conditionalFormats: DEFAULT_CONDITIONAL_FORMATS,
	hiddenPaths: [],
	showHiddenItems: false,
	nestedVaults: true,
	vaultMarker: 'both',
};
