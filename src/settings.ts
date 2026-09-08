import { normalizeHex, normalizePaletteTemplateId, normalizeStrength, paletteTemplate } from './colors';
import {
	DEFAULT_CONDITIONAL_FORMATS,
	DEFAULT_SETTINGS,
	SCHEMA_VERSION,
	type AppearanceRule,
	type BorderRule,
	type ColorChoice,
	type ConditionalFormatRule,
	type DescendantRule,
	type EffectRule,
	type FolderToolkitSettings,
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
	};
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
	};
}

function normalizeAppearance(value: unknown, paletteLength: number): AppearanceRule | null {
	if (!isRecord(value)) return null;
	const text = normalizeEffect(value.text, paletteLength);
	const background = normalizeEffect(value.background, paletteLength);
	const border = normalizeBorder(value.border, paletteLength);
	const descendants = normalizeDescendants(value.descendants);
	if (!text && !background && !border && !descendants) return null;
	return {
		...(text ? { text } : {}),
		...(background ? { background } : {}),
		...(border ? { border } : {}),
		...(descendants ? { descendants } : {}),
	};
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

	return {
		id: value.id,
		target,
		match,
		pattern: value.pattern,
		fontEnabled,
		color: color.kind === 'none' ? { kind: 'custom', hex: '#A8ADB5', strength: 100 } : color,
		backgroundEnabled,
		backgroundColor: backgroundColor.kind === 'none' ? { kind: 'custom', hex: '#A8ADB5', strength: 20 } : backgroundColor,
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
	if (!isRecord(raw)) return structuredClone(DEFAULT_SETTINGS);
	const paletteTemplateId = normalizePaletteTemplateId(raw.paletteTemplateId);
	const paletteLength = paletteTemplate(paletteTemplateId).colors.length;
	const appearanceRules: Record<string, AppearanceRule> = {};
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
		tabStyle: raw.tabStyle === 'background' || raw.tabStyle === 'border' ? raw.tabStyle : 'off',
		appearanceRules,
		conditionalFormats: migratedConditionalFormats,
		hiddenPaths,
		showHiddenItems: raw.showHiddenItems === true,
	};
}
