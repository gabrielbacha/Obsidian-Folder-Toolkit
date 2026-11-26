import { normalizeHex, normalizePaletteTemplateId, normalizeStrength, paletteTemplate } from './colors';
import {
	DEFAULT_CONDITIONAL_FORMATS,
	SCHEMA_VERSION,
	TAB_STYLES,
	VAULT_MARKERS,
	type SavedPreset,
	type TabStyle,
	type VaultMarker,
	type AppearanceRule,
	type BorderAppearanceRule,
	type BorderRule,
	type ColorChoice,
	type ConditionalFormatRule,
	type DescendantRule,
	type EffectRule,
	type FolderToolkitSettings,
	type TextAppearanceRule,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeChoice(value: unknown, paletteLength: number): ColorChoice | null {
	if (!isRecord(value)) return null;
	if (value.kind === 'none') return { kind: 'none' };
	if (value.kind === 'custom') {
		const hex = normalizeHex(value.hex);
		if (!hex) return null;
		return { kind: 'custom', hex, ...(value.strength === undefined ? {} : { strength: normalizeStrength(value.strength) }) };
	}
	if (value.kind === 'preset' && Number.isInteger(value.slot)) {
		const slot = Number(value.slot);
		return slot >= 0 && slot < Math.max(paletteLength, 10)
			? { kind: 'preset', slot, ...(value.strength === undefined ? {} : { strength: normalizeStrength(value.strength) }) }
			: null;
	}
	return null;
}

function normalizeEffect(value: unknown, paletteLength: number): EffectRule | undefined {
	if (!isRecord(value)) return undefined;
	const choice = normalizeChoice(value.choice, paletteLength);
	return choice ? { choice, cascade: value.cascade === true } : undefined;
}

function normalizeTextAppearance(value: unknown, paletteLength: number): TextAppearanceRule | undefined {
	if (!isRecord(value)) return undefined;
	const color = normalizeChoice(value.color ?? value.choice, paletteLength);
	const inheritTypography = value.inheritTypography === true;
	const hasTypography = !inheritTypography && (typeof value.bold === 'boolean' || typeof value.strikethrough === 'boolean');
	if (!color && !hasTypography) return undefined;
	return {
		...(color ? { color } : {}),
		...(inheritTypography ? { inheritTypography: true } : {}),
		bold: value.bold === true,
		strikethrough: value.strikethrough === true,
		cascade: value.cascade === true,
	};
}

function normalizeThickness(value: unknown): 'thin' | 'medium' | 'thick' | undefined {
	return value === 'thin' || value === 'medium' || value === 'thick' ? value : undefined;
}

function normalizeBorder(value: unknown, paletteLength: number): BorderRule | undefined {
	if (!isRecord(value) || (value.style !== 'box' && value.style !== 'rail')) return undefined;
	const color = normalizeChoice(value.color, paletteLength);
	if (!color || color.kind === 'none') return undefined;
	return {
		style: value.style,
		color,
		thickness: normalizeThickness(value.thickness),
		shading: value.shading === true,
		...(value.shadingStrength === undefined ? {} : { shadingStrength: normalizeStrength(value.shadingStrength) }),
	};
}

function normalizeBorderAppearance(value: unknown, paletteLength: number): BorderAppearanceRule | undefined {
	if (isRecord(value) && value.kind === 'none') return { kind: 'none' };
	return normalizeBorder(value, paletteLength);
}

function normalizeDescendants(value: unknown): DescendantRule | undefined {
	if (!isRecord(value)) return undefined;
	const enabled = value.enabled === true;
	if (!enabled) return undefined;
	return {
		enabled: true,
		style: value.style === 'box' || value.style === 'rail' ? value.style : 'rail',
		thickness: normalizeThickness(value.thickness),
		shading: value.shading === true,
		...(value.borderStrength === undefined ? {} : { borderStrength: normalizeStrength(value.borderStrength) }),
		...(value.shadingStrength === undefined ? {} : { shadingStrength: normalizeStrength(value.shadingStrength) }),
	};
}

export function normalizeAppearance(value: unknown, paletteLength: number): AppearanceRule | null {
	if (!isRecord(value)) return null;
	const text = normalizeTextAppearance(value.text, paletteLength);
	const background = normalizeEffect(value.background, paletteLength);
	const border = normalizeBorderAppearance(value.border, paletteLength);
	const descendants = normalizeDescendants(value.descendants);
	const tabs = typeof value.tabs === 'boolean' ? value.tabs : undefined;
	if (!text && !background && !border && !descendants && tabs === undefined) return null;
	return {
		...(text ? { text } : {}),
		...(background ? { background } : {}),
		...(border ? { border } : {}),
		...(descendants ? { descendants } : {}),
		...(tabs === undefined ? {} : { tabs }),
	};
}

function normalizeSavedPresets(value: unknown, paletteLength: number): SavedPreset[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const presets: SavedPreset[] = [];
	for (const entry of value) {
		if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) continue;
		const name = typeof entry.name === 'string' ? entry.name.trim() : '';
		const rule = normalizeAppearance(entry.rule, paletteLength);
		if (!name || !rule) continue;
		seen.add(entry.id);
		presets.push({ id: entry.id, name, rule });
	}
	return presets;
}

function normalizeTabStyle(value: unknown): TabStyle {
	return TAB_STYLES.includes(value as TabStyle) ? value as TabStyle : 'off';
}

function normalizeConditionalFormat(value: unknown, paletteLength: number): ConditionalFormatRule | null {
	if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.pattern !== 'string') return null;
	const target = value.target === 'folder' || value.target === 'file' || value.target === 'both' ? value.target : null;
	const match = value.match === 'equals' || value.match === 'startsWith' || value.match === 'endsWith' || value.match === 'contains'
		? value.match
		: null;
	if (!target || !match) return null;

	// `effect` and `background` are legacy single-channel fields from 1.2.1.
	const legacyEffect = value.effect === 'text' || value.effect === 'background' || value.effect === 'both'
		? value.effect
		: value.background !== undefined ? 'background' : 'both';

	const color = normalizeChoice(value.color ?? value.background, paletteLength)
		?? { kind: 'custom', hex: '#A8ADB5', strength: 100 };

	const rawBg = value.backgroundColor ?? (legacyEffect === 'background' || legacyEffect === 'both' ? (value.color ?? value.background) : undefined);
	const backgroundColor = normalizeChoice(rawBg, paletteLength)
		?? { kind: 'custom', hex: '#A8ADB5', strength: 20 };

	const fontEnabled = value.fontEnabled !== undefined
		? value.fontEnabled === true
		: legacyEffect !== 'background';

	const backgroundEnabled = value.backgroundEnabled !== undefined
		? value.backgroundEnabled === true
		: legacyEffect === 'background' || legacyEffect === 'both';
	const border = normalizeBorder(value.border, paletteLength);
	const borderEnabled = value.borderEnabled === true && border !== undefined;

	return {
		id: value.id,
		target,
		match,
		pattern: value.pattern,
		fontEnabled,
		color: color.kind === 'none' ? { kind: 'custom', hex: '#A8ADB5', strength: 100 } : color,
		backgroundEnabled,
		backgroundColor: backgroundColor.kind === 'none' ? { kind: 'custom', hex: '#A8ADB5', strength: 20 } : backgroundColor,
		...(value.borderEnabled !== undefined || border ? { borderEnabled } : {}),
		...(border ? { border } : {}),
		bold: value.bold === true,
		strikethrough: value.strikethrough === true,
	};
}

function addDefaultConditionalFormats(rules: ConditionalFormatRule[]): ConditionalFormatRule[] {
	const result = [...rules];
	for (const builtIn of [...DEFAULT_CONDITIONAL_FORMATS].reverse()) {
		const exists = result.some((rule) => rule.target === builtIn.target
			&& rule.match === builtIn.match
			&& rule.fontEnabled === builtIn.fontEnabled
			&& rule.backgroundEnabled === builtIn.backgroundEnabled
			&& rule.pattern.toLocaleLowerCase() === builtIn.pattern.toLocaleLowerCase());
		if (!exists) result.unshift(structuredClone(builtIn));
	}
	return result;
}

export function normalizeSettings(raw: unknown): FolderToolkitSettings {
	if (raw === null || raw === undefined) raw = {};
	if (!isRecord(raw)) throw new Error('Saved Folder Toolkit settings must be an object. The original data is unchanged.');
	if (raw.schemaVersion !== undefined && (typeof raw.schemaVersion !== 'number' || !Number.isSafeInteger(raw.schemaVersion) || raw.schemaVersion < 0)) throw new Error('Saved Folder Toolkit schema version is invalid. Settings are read-only.');
	if (raw.appearanceRules !== undefined && !isRecord(raw.appearanceRules)) throw new Error('Saved appearance rules must be a path dictionary. Settings are read-only.');
	if (raw.conditionalFormats !== undefined && !Array.isArray(raw.conditionalFormats)) throw new Error('Saved name rules must be a list. Settings are read-only.');
	if (raw.savedPresets !== undefined && !Array.isArray(raw.savedPresets)) throw new Error('Saved presets must be a list. Settings are read-only.');
	if (raw.hiddenPaths !== undefined && !Array.isArray(raw.hiddenPaths)) throw new Error('Saved hidden paths must be a list. Settings are read-only.');
	if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) throw new Error(`Settings schema ${raw.schemaVersion} requires a newer Folder Toolkit. Settings are read-only.`);
	const paletteTemplateId = normalizePaletteTemplateId(raw.paletteTemplateId);
	const paletteLength = paletteTemplate(paletteTemplateId).colors.length;
	const appearanceRules: Record<string, AppearanceRule> = Object.create(null) as Record<string, AppearanceRule>;
	if (isRecord(raw.appearanceRules)) {
		for (const [path, value] of Object.entries(raw.appearanceRules)) {
			if (!path) continue;
			const normalized = normalizeAppearance(value, paletteLength);
			if (normalized) appearanceRules[path] = normalized;
		}
	}
	const hiddenPaths = Array.isArray(raw.hiddenPaths)
		? [...new Set(raw.hiddenPaths.filter((path): path is string => typeof path === 'string' && path.length > 0))]
		: [];
	const conditionalFormats = Array.isArray(raw.conditionalFormats)
		? raw.conditionalFormats
			.map((value) => normalizeConditionalFormat(value, paletteLength))
			.filter((value): value is ConditionalFormatRule => value !== null)
		: [];
	const migratedConditionalFormats = typeof raw.schemaVersion !== 'number' || raw.schemaVersion < 3
		? addDefaultConditionalFormats(conditionalFormats) : conditionalFormats;
	return {
		schemaVersion: SCHEMA_VERSION,
		paletteTemplateId,
		tabStyle: normalizeTabStyle(raw.tabStyle),
		tabStyleWhenOn: tabStyleWhenOn(raw),
		appearanceRules,
		conditionalFormats: migratedConditionalFormats,
		savedPresets: normalizeSavedPresets(raw.savedPresets, paletteLength),
		hiddenPaths,
		showHiddenItems: raw.showHiddenItems === true,
		nestedVaults: raw.nestedVaults !== false,
		vaultMarker: VAULT_MARKERS.includes(raw.vaultMarker as VaultMarker) ? raw.vaultMarker as VaultMarker : 'both',
	};
}

function tabStyleWhenOn(raw: Record<string, unknown>): Exclude<TabStyle, 'off'> {
	const saved = normalizeTabStyle(raw.tabStyleWhenOn);
	if (saved !== 'off') return saved;
	const current = normalizeTabStyle(raw.tabStyle);
	return current === 'off' ? 'both' : current;
}
