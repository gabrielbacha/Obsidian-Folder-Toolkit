import { resolveAutomaticText, resolveChoice, resolveTextAgainstBackground, paletteTemplate, type ResolvedColor } from './colors';
import { parentPaths } from './path-utils';
import { conditionalAppearanceFor } from './conditional-format';
import type { AppearanceRule, BorderRule, EffectRule, FolderToolkitSettings } from './types';

export function hasDirectAppearance(rule: AppearanceRule | undefined): boolean {
	const backgroundKind = rule?.background?.choice.kind;
	const textKind = rule?.text?.color?.kind;
	return (backgroundKind !== undefined && backgroundKind !== 'none')
		|| (textKind !== undefined && textKind !== 'none')
		|| rule?.border !== undefined
		|| rule?.text !== undefined;
}

export interface ResolvedAppearance {
	directBackground?: EffectRule;
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
	const conditional = context.conditional?.background;
	if (conditional) return conditional;
	for (const parent of (context.parents ?? parentPaths(path))) {
		const candidate = rules[parent]?.background;
		if (candidate?.cascade) return candidate;
	}
	return undefined;
}

function effectiveTextColor(path: string, context: ResolverContext): EffectRule | undefined {
	const rules = context.settings.appearanceRules;
	const direct = rules[path]?.text;
	if (direct?.color) return { choice: direct.color, cascade: direct.cascade };
	const conditional = context.conditional?.text;
	if (conditional) return conditional;
	for (const parent of (context.parents ?? parentPaths(path))) {
		const candidate = rules[parent]?.text;
		if (candidate?.cascade && candidate.color) return { choice: candidate.color, cascade: true };
	}
	return undefined;
}

export interface TypographyResolution {
	bold: boolean;
	strikethrough: boolean;
	origin: string | null;
	kind: 'direct' | 'conditional' | 'ancestor' | 'default';
}

export function typographyFor(path: string, context: ResolverContext): TypographyResolution {
	const rules = context.settings.appearanceRules;
	const direct = rules[path]?.text;
	if (direct && !direct.inheritTypography) return { bold: direct.bold, strikethrough: direct.strikethrough, origin: path, kind: 'direct' };
	const conditional = (context.conditional ?? conditionalAppearanceFor(path, isFolderPath(path, context), context.settings))?.styles;
	if (conditional) return { ...conditional, origin: null, kind: 'conditional' };
	for (const parent of (context.parents ?? parentPaths(path))) {
		const candidate = rules[parent]?.text;
		if (candidate?.cascade && !candidate.inheritTypography) return { bold: candidate.bold, strikethrough: candidate.strikethrough, origin: parent, kind: 'ancestor' };
	}
	return { bold: false, strikethrough: false, origin: null, kind: 'default' };
}

export interface ResolverContext {
	settings: FolderToolkitSettings;
	getDescendantIndex?: (path: string, root: string) => number;
	isFolder?: boolean;
	parents?: string[];
	conditional?: ReturnType<typeof conditionalAppearanceFor>;
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

	const conditional = context.conditional?.border;
	if (conditional) return conditional;

	// Descendant border rules only apply to folders
	if (!isFolderPath(path, context)) return undefined;

	// Alternating borders intentionally apply to direct subfolders only.
	const parents = (context.parents ?? parentPaths(path));
	if (parents.length === 0) return undefined;
	const immediateParent = parents[0];
	const descendants = context.settings.appearanceRules[immediateParent]?.descendants;
	if (descendants?.enabled) {
		const template = paletteTemplate(descendants.palette ?? context.settings.paletteTemplateId);
		let slot = 0;
		if (context.getDescendantIndex) {
			const index = context.getDescendantIndex(path, immediateParent);
			slot = index % template.colors.length;
		}
		return {
			style: descendants.style,
			thickness: descendants.thickness,
			shading: descendants.shading,
			color: { kind: 'preset', slot, ...(descendants.palette ? { palette: descendants.palette } : {}) },
		};
	}
	return undefined;
}

export function resolveAppearance(path: string, context: ResolverContext): ResolvedAppearance {
	context = { ...context, parents: parentPaths(path), conditional: conditionalAppearanceFor(path, isFolderPath(path, context), context.settings) };
	const text = effectiveTextColor(path, context);
	const background = effectiveBackground(path, context);
	const border = effectiveBorder(path, context);
	
	const resolvedBorder = border ? resolveChoice(border.color, context.settings.paletteTemplateId) : null;
	const resolvedBackground = background ? resolveChoice(background.choice, context.settings.paletteTemplateId) : null;
	const resolvedText = text ? resolveChoice(text.choice, context.settings.paletteTemplateId) : null;
	const automaticText = !text && resolvedBackground?.strength !== undefined && resolvedBackground.strength > 12
		? resolveAutomaticText(resolvedBackground)
		: null;
	
	const styles = typographyFor(path, context);

	return {
		directBackground: context.settings.appearanceRules[path]?.background ?? context.conditional?.background,
		text: resolvedText ? resolveTextAgainstBackground(resolvedText, resolvedBackground) : automaticText,
		background: resolvedBackground,
		border: border && resolvedBorder ? { style: border.style, color: resolvedBorder, thickness: border.thickness, shading: border.shading } : null,
		bold: styles.bold,
		strikethrough: styles.strikethrough,
	};
}
