import { paletteTemplate, resolveChoice, resolveTextAgainstBackground, type ResolvedColor } from './colors';
import { parentPaths } from './path-utils';
import type { AppearanceRule, BorderRule, EffectRule, FolderToolkitSettings } from './types';

export interface AppearanceResolveOptions {
	borderPaletteOffset?: number;
}

export interface ResolvedAppearance {
	text: ResolvedColor | null;
	background: ResolvedColor | null;
	border: {
		style: 'box' | 'rail';
		color: ResolvedColor;
		thickness: 'thin' | 'medium' | 'thick';
		shade: boolean;
		inherited: boolean;
	} | null;
}

function effectiveEffect(
	path: string,
	key: 'text' | 'background',
	rules: Readonly<Record<string, AppearanceRule>>,
): EffectRule | undefined {
	const direct = rules[path]?.[key];
	if (direct) return direct;
	for (const parent of parentPaths(path)) {
		const candidate = rules[parent]?.[key];
		if (candidate?.cascade) return candidate;
	}
	return undefined;
}

function effectiveBorder(
	path: string,
	rules: Readonly<Record<string, AppearanceRule>>,
): { rule: BorderRule; inherited: boolean } | null {
	const direct = rules[path]?.border;
	if (direct) {
		if (direct.color.kind === 'none' || direct.scope === 'descendants') return null;
		return { rule: direct, inherited: false };
	}
	for (const parent of parentPaths(path)) {
		const candidate = rules[parent]?.border;
		if (!candidate || candidate.scope === 'self') continue;
		if (candidate.color.kind === 'none') return null;
		return { rule: candidate, inherited: true };
	}
	return null;
}

function resolveBorderColor(
	border: { rule: BorderRule; inherited: boolean },
	settings: FolderToolkitSettings,
	offset: number,
): ResolvedColor | null {
	if (!border.inherited) return resolveChoice(border.rule.color, settings.paletteTemplateId);
	const template = paletteTemplate(settings.paletteTemplateId);
	const start = border.rule.color.kind === 'preset' ? border.rule.color.slot : 0;
	return resolveChoice(
		{ kind: 'preset', slot: (start + Math.max(0, offset) + 1) % template.colors.length },
		settings.paletteTemplateId,
	);
}

export function resolveAppearance(
	path: string,
	settings: FolderToolkitSettings,
	options: AppearanceResolveOptions = {},
): ResolvedAppearance {
	const text = effectiveEffect(path, 'text', settings.appearanceRules);
	const background = effectiveEffect(path, 'background', settings.appearanceRules);
	const border = effectiveBorder(path, settings.appearanceRules);
	const resolvedBorder = border ? resolveBorderColor(border, settings, options.borderPaletteOffset ?? 0) : null;
	const resolvedBackground = background ? resolveChoice(background.choice, settings.paletteTemplateId) : null;
	const resolvedText = text ? resolveChoice(text.choice, settings.paletteTemplateId) : null;
	return {
		text: resolvedText ? resolveTextAgainstBackground(resolvedText, resolvedBackground) : null,
		background: resolvedBackground,
		border: border && resolvedBorder ? {
			style: border.rule.style,
			color: resolvedBorder,
			thickness: border.rule.thickness,
			shade: border.rule.shade,
			inherited: border.inherited,
		} : null,
	};
}
