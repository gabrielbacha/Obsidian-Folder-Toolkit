import { resolveChoice, resolveTextAgainstBackground, type ResolvedColor } from './colors';
import { parentPaths } from './path-utils';
import type { AppearanceRule, EffectRule, FolderToolkitSettings } from './types';

export interface ResolvedAppearance {
	text: ResolvedColor | null;
	background: ResolvedColor | null;
	border: { style: 'box' | 'rail'; color: ResolvedColor } | null;
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

export function resolveAppearance(path: string, settings: FolderToolkitSettings): ResolvedAppearance {
	const text = effectiveEffect(path, 'text', settings.appearanceRules);
	const background = effectiveEffect(path, 'background', settings.appearanceRules);
	const border = settings.appearanceRules[path]?.border;
	const resolvedBorder = border ? resolveChoice(border.color, settings.paletteTemplateId) : null;
	const resolvedBackground = background ? resolveChoice(background.choice, settings.paletteTemplateId) : null;
	const resolvedText = text ? resolveChoice(text.choice, settings.paletteTemplateId) : null;
	return {
		text: resolvedText ? resolveTextAgainstBackground(resolvedText, resolvedBackground) : null,
		background: resolvedBackground,
		border: border && resolvedBorder ? { style: border.style, color: resolvedBorder } : null,
	};
}
