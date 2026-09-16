import { resolveAutomaticText, resolveChoice, resolveTextAgainstBackground, paletteTemplate, type ResolvedColor } from './colors';
import { parentPaths } from './path-utils';
import { conditionalBorderFor, conditionalEffectFor, conditionalStylesFor } from './conditional-format';
import type { AppearanceRule, BorderRule, EffectRule, FolderToolkitSettings, TextAppearanceRule } from './types';

export function hasDirectAppearance(rule: AppearanceRule | undefined): boolean {
	const backgroundKind = rule?.background?.choice.kind;
	const textKind = rule?.text?.color?.kind;
	return (backgroundKind !== undefined && backgroundKind !== 'none')
		|| (textKind !== undefined && textKind !== 'none')
		|| rule?.border !== undefined
		|| rule?.text !== undefined;
}

export interface ResolvedAppearance {
	text: ResolvedColor | null;
	background: ResolvedColor | null;
	border: { style: 'box' | 'rail'; color: ResolvedColor; thickness?: 'thin' | 'medium' | 'thick'; shading?: boolean } | null;
	bold: boolean;
	strikethrough: boolean;
}

function effectiveBackground(
	path: string,
	context: ResolverContext,
): EffectRule | undefined {
	const rules = context.settings.appearanceRules;
	const direct = rules[path]?.background;
	if (direct) return direct;
	const conditional = conditionalEffectFor(path, isFolderPath(path, context), 'background', context.settings);
	if (conditional) return conditional;
	for (const parent of parentPaths(path)) {
		const candidate = rules[parent]?.background;
		if (candidate?.cascade) return candidate;
	}
	return undefined;
}

function effectiveTextColor(path: string, context: ResolverContext): EffectRule | undefined {
	const rules = context.settings.appearanceRules;
	const direct = rules[path]?.text;
	if (direct?.color) return { choice: direct.color, cascade: direct.cascade };
	const conditional = conditionalEffectFor(path, isFolderPath(path, context), 'text', context.settings);
	if (conditional) return conditional;
	for (const parent of parentPaths(path)) {
		const candidate = rules[parent]?.text;
		if (candidate?.cascade && candidate.color) return { choice: candidate.color, cascade: true };
	}
	return undefined;
}

function effectiveTypography(path: string, context: ResolverContext): Pick<TextAppearanceRule, 'bold' | 'strikethrough'> {
	const rules = context.settings.appearanceRules;
	const direct = rules[path]?.text;
	if (direct) return direct;
	const conditional = conditionalStylesFor(path, isFolderPath(path, context), context.settings);
	if (conditional) return conditional;
	for (const parent of parentPaths(path)) {
		const candidate = rules[parent]?.text;
		if (candidate?.cascade) return candidate;
	}
	return { bold: false, strikethrough: false };
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
): BorderRule | null | undefined {
	const direct = context.settings.appearanceRules[path]?.border;
	if (direct) {
		if ('kind' in direct) return null;
		return direct;
	}

	const conditional = conditionalBorderFor(path, isFolderPath(path, context), context.settings);
	if (conditional) return conditional;

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
	const text = effectiveTextColor(path, context);
	const background = effectiveBackground(path, context);
	const border = effectiveBorder(path, context);
	
	const resolvedBorder = border ? resolveChoice(border.color, context.settings.paletteTemplateId) : null;
	const resolvedBackground = background ? resolveChoice(background.choice, context.settings.paletteTemplateId) : null;
	const resolvedText = text ? resolveChoice(text.choice, context.settings.paletteTemplateId) : null;
	const automaticText = !text && resolvedBackground?.strength !== undefined && resolvedBackground.strength > 12
		? resolveAutomaticText(resolvedBackground)
		: null;
	
	const styles = effectiveTypography(path, context);

	return {
		text: resolvedText ? resolveTextAgainstBackground(resolvedText, resolvedBackground) : automaticText,
		background: resolvedBackground,
		border: border && resolvedBorder ? { style: border.style, color: resolvedBorder, thickness: border.thickness, shading: border.shading } : null,
		bold: styles.bold,
		strikethrough: styles.strikethrough,
	};
}
