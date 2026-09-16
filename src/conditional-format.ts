import type { BorderRule, ColorChoice, ConditionalFormatRule, EffectRule, FolderToolkitSettings } from './types';

function basename(path: string): string {
	return path.split('/').at(-1) ?? path;
}

export function matchesConditionalFormat(path: string, isFolder: boolean, rule: ConditionalFormatRule): boolean {
	if (!rule.pattern) return false;
	if (rule.target !== 'both' && rule.target !== (isFolder ? 'folder' : 'file')) return false;
	const name = basename(path);
	const candidate = name.toLocaleLowerCase();
	const candidateWithoutExt = !isFolder ? candidate.replace(/\.[a-z0-9]+$/, '') : candidate;
	const pattern = rule.pattern.toLocaleLowerCase();
	switch (rule.match) {
		case 'equals': return candidate === pattern || candidateWithoutExt === pattern;
		case 'startsWith': return candidate.startsWith(pattern);
		case 'endsWith': return candidate.endsWith(pattern) || candidateWithoutExt.endsWith(pattern);
		case 'contains': return candidate.includes(pattern);
	}
}

export function isFontEnabled(rule: ConditionalFormatRule): boolean {
	return rule.fontEnabled !== false;
}

export function isBackgroundEnabled(rule: ConditionalFormatRule): boolean {
	return rule.backgroundEnabled === true;
}

export function isBorderEnabled(rule: ConditionalFormatRule): boolean {
	return rule.borderEnabled === true && rule.border !== undefined;
}

export function conditionalBorderFor(
	path: string,
	isFolder: boolean,
	settings: FolderToolkitSettings,
): BorderRule | undefined {
	let matched: BorderRule | undefined;
	for (const rule of settings.conditionalFormats) {
		if (matchesConditionalFormat(path, isFolder, rule) && isBorderEnabled(rule)) matched = rule.border;
	}
	return matched;
}

export function conditionalEffectFor(
	path: string,
	isFolder: boolean,
	effect: 'text' | 'background',
	settings: FolderToolkitSettings,
): EffectRule | undefined {
	let matchedChoice: Exclude<ColorChoice, { kind: 'none' }> | undefined;
	for (const rule of settings.conditionalFormats) {
		if (!matchesConditionalFormat(path, isFolder, rule)) continue;
		if (effect === 'text' && isFontEnabled(rule)) {
			matchedChoice = rule.color;
		}
		if (effect === 'background' && isBackgroundEnabled(rule)) {
			matchedChoice = rule.backgroundColor ?? rule.color;
		}
	}
	return matchedChoice ? { choice: matchedChoice, cascade: false } : undefined;
}

export function conditionalStylesFor(
	path: string,
	isFolder: boolean,
	settings: FolderToolkitSettings,
): { bold: boolean; strikethrough: boolean } | undefined {
	let matched: { bold: boolean; strikethrough: boolean } | undefined;
	for (const rule of settings.conditionalFormats) {
		if (matchesConditionalFormat(path, isFolder, rule)) {
			matched = { bold: rule.bold === true, strikethrough: rule.strikethrough === true };
		}
	}
	return matched;
}
