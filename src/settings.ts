import { normalizeHex, normalizePaletteTemplateId, normalizeStrength, paletteTemplate } from './colors';
import {
	DEFAULT_SETTINGS,
	SCHEMA_VERSION,
	type AppearanceRule,
	type BorderRule,
	type ColorChoice,
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
	return {
		schemaVersion: SCHEMA_VERSION,
		paletteTemplateId,
		tabStyle: raw.tabStyle === 'background' || raw.tabStyle === 'border' ? raw.tabStyle : 'off',
		appearanceRules,
		hiddenPaths,
		showHiddenItems: raw.showHiddenItems === true,
	};
}
