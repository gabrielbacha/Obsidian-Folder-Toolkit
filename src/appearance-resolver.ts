import { resolveAutomaticText, resolveChoice, resolveTextAgainstBackground, paletteTemplate, type ResolvedColor } from './colors';
import { parentPaths } from './path-utils';
import { conditionalEffectFor } from './conditional-format';
import type { AppearanceRule, BorderRule, EffectRule, FolderToolkitSettings } from './types';

export function hasDirectColor(rule: AppearanceRule | undefined): boolean {
	const backgroundKind = rule?.background?.choice.kind;
	const textKind = rule?.text?.choice.kind;
	return (backgroundKind !== undefined && backgroundKind !== 'none')
		|| (textKind !== undefined && textKind !== 'none')
		|| rule?.border !== undefined;
}

export interface ResolvedAppearance {
	text: ResolvedColor | null;
	background: ResolvedColor | null;
	border: { style: 'box' | 'rail'; color: ResolvedColor; thickness?: 'thin' | 'medium' | 'thick'; shading?: boolean } | null;
}

function effectiveEffect(
	path: string,
	key: 'text' | 'background',
	context: ResolverContext,
): EffectRule | undefined {
	const rules = context.settings.appearanceRules;
	const direct = rules[path]?.[key];
	if (direct) return direct;
	const conditional = conditionalEffectFor(path, isFolderPath(path, context), key, context.settings);
	if (conditional) return conditional;
	for (const parent of parentPaths(path)) {
		const candidate = rules[parent]?.[key];
		if (candidate?.cascade) return candidate;
	}
	return undefined;
}

export interface ResolverContext {
	settings: FolderToolkitSettings;
	getDescendantIndex?: (path: string, root: string) => number;
	isFolder?: boolean;
}

function isFolderPath(path: string, context: ResolverContext): boolean {
	if (context.isFolder !== undefined) return context.isFolder;
	return !/\.[a-zA-Z0-9]+$/.test(path);
}

function effectiveBorder(
	path: string,
	context: ResolverContext,
): BorderRule | undefined {
	const direct = context.settings.appearanceRules[path]?.border;
	if (direct) return direct;

	// Descendant border rules only apply to folders
	if (!isFolderPath(path, context)) return undefined;

	// Alternating borders intentionally apply to direct subfolders only.
	const parents = parentPaths(path);
	if (parents.length === 0) return undefined;
	const immediateParent = parents[0];
	const descendants = context.settings.appearanceRules[immediateParent]?.descendants;
	if (descendants?.enabled) {
		const template = paletteTemplate(context.settings.paletteTemplateId);
		let slot = 0;
		if (context.getDescendantIndex) {
			const index = context.getDescendantIndex(path, immediateParent);
			slot = index % template.colors.length;
		}
		return {
			style: descendants.style,
			thickness: descendants.thickness,
			shading: descendants.shading,
			color: { kind: 'preset', slot },
		};
	}
	return undefined;
}

export function resolveAppearance(path: string, context: ResolverContext): ResolvedAppearance {
	const text = effectiveEffect(path, 'text', context);
	const background = effectiveEffect(path, 'background', context);
	const border = effectiveBorder(path, context);
	
	const resolvedBorder = border ? resolveChoice(border.color, context.settings.paletteTemplateId) : null;
	const resolvedBackground = background ? resolveChoice(background.choice, context.settings.paletteTemplateId) : null;
	const resolvedText = text ? resolveChoice(text.choice, context.settings.paletteTemplateId) : null;
	const automaticText = !text && resolvedBackground?.strength !== undefined && resolvedBackground.strength > 12
		? resolveAutomaticText(resolvedBackground)
		: null;
	
	return {
		text: resolvedText ? resolveTextAgainstBackground(resolvedText, resolvedBackground) : automaticText,
		background: resolvedBackground,
		border: border && resolvedBorder ? { style: border.style, color: resolvedBorder, thickness: border.thickness, shading: border.shading } : null,
	};
}
