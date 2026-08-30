import { isSameOrDescendant } from './path-utils';
import type { AppearanceRule, FolderToolkitSettings } from './types';

export class AppearancePreviewStore {
	private readonly rules = new Map<string, AppearanceRule | null>();

	set(path: string, rule: AppearanceRule): void {
		this.rules.set(path, Object.keys(rule).length === 0 ? null : structuredClone(rule));
	}

	clear(path: string): void {
		this.rules.delete(path);
	}

	clearAll(): void {
		this.rules.clear();
	}

	clearSubtree(path: string): void {
		for (const previewPath of this.rules.keys()) {
			if (isSameOrDescendant(previewPath, path)) this.rules.delete(previewPath);
		}
	}

	apply(settings: FolderToolkitSettings): FolderToolkitSettings {
		if (this.rules.size === 0) return settings;
		const appearanceRules = { ...settings.appearanceRules };
		for (const [path, rule] of this.rules) {
			if (rule) appearanceRules[path] = structuredClone(rule);
			else delete appearanceRules[path];
		}
		return { ...settings, appearanceRules };
	}
}
