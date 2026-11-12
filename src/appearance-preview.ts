import { isSameOrDescendant } from './path-utils';
import type { AppearanceRule, ConditionalFormatRule, FolderToolkitSettings } from './types';

export class AppearancePreviewStore {
	private cache: { settings: FolderToolkitSettings; result: FolderToolkitSettings } | null = null;
	private readonly rules = new Map<string, AppearanceRule | null>();
	private readonly conditionalRules = new Map<string, ConditionalFormatRule>();

	set(path: string, rule: AppearanceRule): void {
		this.cache = null;
		this.rules.set(path, Object.keys(rule).length === 0 ? null : structuredClone(rule));
	}

	clear(path: string): void {
		this.cache = null;
		this.rules.delete(path);
	}

	setConditional(rule: ConditionalFormatRule): void {
		this.cache = null;
		this.conditionalRules.set(rule.id, structuredClone(rule));
	}

	clearConditional(id: string): void {
		this.cache = null;
		this.conditionalRules.delete(id);
	}

	clearAll(): void {
		this.cache = null;
		this.rules.clear();
		this.conditionalRules.clear();
	}

	clearSubtree(path: string): void {
		for (const previewPath of this.rules.keys()) {
			if (isSameOrDescendant(previewPath, path)) { this.cache = null; this.rules.delete(previewPath); }
		}
	}

	apply(settings: FolderToolkitSettings): FolderToolkitSettings {
		if (this.cache?.settings === settings) return this.cache.result;
		if (this.rules.size === 0 && this.conditionalRules.size === 0) return settings;
		const appearanceRules = Object.assign(Object.create(null) as Record<string, AppearanceRule>, settings.appearanceRules);
		for (const [path, rule] of this.rules) {
			if (rule) appearanceRules[path] = structuredClone(rule);
			else delete appearanceRules[path];
		}
		const conditionalFormats = settings.conditionalFormats.map((rule) => structuredClone(this.conditionalRules.get(rule.id) ?? rule));
		const result = { ...settings, appearanceRules, conditionalFormats };
		this.cache = { settings, result };
		return result;
	}
}
