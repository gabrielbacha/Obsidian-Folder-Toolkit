import { resolveChoice, resolveTextAgainstBackground, paletteTemplate, type ResolvedColor } from './colors';
import { parentPaths } from './path-utils';
import type { BorderRule, EffectRule, FolderToolkitSettings } from './types';

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

	// For background: if this path itself has direct border shading, don't inherit ancestor background
	if (key === 'background' && rules[path]?.border?.shading) {
		return undefined;
	}

	const parents = parentPaths(path);
	for (let i = 0; i < parents.length; i++) {
		const parent = parents[i];
		const candidate = rules[parent]?.[key];

		if (candidate?.cascade) {
			if (key === 'background') {
				// Check if any intermediate parent has direct border shading
				for (let j = 0; j < i; j++) {
					if (rules[parents[j]]?.border?.shading) return undefined;
				}

				// Check if the ancestor has alternating descendant shading
				const descendants = rules[parent]?.descendants;
				if (descendants?.enabled && descendants.shading) {
					// If i > 0, it is at least one subfolder deep, so it's inside a subfolder
					if (i > 0) return undefined;
					// If i === 0: path is a direct child of parent. If this direct child has a descendant border, it's a subfolder with shading!
					const ownBorder = effectiveBorder(path, context);
					if (ownBorder?.shading) return undefined;
				}
			}
			return candidate;
		}
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

	// Alternating subfolder borders only apply 1 level down from the root folder
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
	
	return {
		text: resolvedText ? resolveTextAgainstBackground(resolvedText, resolvedBackground) : null,
		background: resolvedBackground,
		border: border && resolvedBorder ? { style: border.style, color: resolvedBorder, thickness: border.thickness, shading: border.shading } : null,
	};
}
