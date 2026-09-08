import type { ConditionalFormatRule, EffectRule, FolderToolkitSettings } from './types';

function basename(path: string): string {
	return path.split('/').at(-1) ?? path;
}

export function matchesConditionalFormat(path: string, isFolder: boolean, rule: ConditionalFormatRule): boolean {
	if (!rule.pattern) return false;
	if (rule.target !== 'both' && rule.target !== (isFolder ? 'folder' : 'file')) return false;
	const name = basename(path);
	const candidate = name.toLocaleLowerCase();
	const pattern = rule.pattern.toLocaleLowerCase();
	switch (rule.match) {
		case 'equals': return candidate === pattern;
		case 'startsWith': return candidate.startsWith(pattern);
		case 'endsWith': return candidate.endsWith(pattern);
		case 'contains': return candidate.includes(pattern);
	}
}

export function conditionalBackgroundFor(
	path: string,
	isFolder: boolean,
	settings: FolderToolkitSettings,
): EffectRule | undefined {
	let matched: ConditionalFormatRule | undefined;
	for (const rule of settings.conditionalFormats) {
		if (matchesConditionalFormat(path, isFolder, rule)) matched = rule;
	}
	return matched ? { choice: matched.background, cascade: false } : undefined;
}
