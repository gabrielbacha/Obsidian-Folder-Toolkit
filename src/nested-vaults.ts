import { isSameOrDescendant, parentPaths, replacePathRoot } from './path-utils';
import { normalizeSettings } from './settings';
import {
	DEFAULT_SETTINGS,
	type AppearanceRule,
	type ColorChoice,
	type ConditionalFormatRule,
	type FolderToolkitSettings,
	type PaletteTemplateId,
} from './types';

/** The part of Obsidian's `DataAdapter` that this module uses. */
export interface VaultFiles {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	stat(path: string): Promise<{ mtime: number } | null>;
}

/** Settings of one vault that is a folder inside this vault. Rule paths are relative to `root`. */
export interface NestedVaultLayer {
	root: string;
	settings: FolderToolkitSettings;
}

/**
 * Where a folder's appearance is saved. `root` is null for this vault.
 * `skippedVault` names a nested vault without Folder Toolkit, so the rule stays in this vault.
 */
export interface AppearanceOwner {
	root: string | null;
	relativePath: string;
	skippedVault?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function depth(path: string): number {
	return path.split('/').length;
}

function tagChoice<T extends ColorChoice>(choice: T, palette: PaletteTemplateId): T {
	return choice.kind === 'preset' ? { ...choice, palette } : choice;
}

/** Marks every palette color in `rule` with the palette of the vault that owns it. */
export function tagAppearancePalette(rule: AppearanceRule, palette: PaletteTemplateId): AppearanceRule {
	const tagged = structuredClone(rule);
	if (tagged.text?.color) tagged.text.color = tagChoice(tagged.text.color, palette);
	if (tagged.background) tagged.background.choice = tagChoice(tagged.background.choice, palette);
	if (tagged.border && !('kind' in tagged.border)) tagged.border.color = tagChoice(tagged.border.color, palette);
	if (tagged.descendants) tagged.descendants.palette = palette;
	return tagged;
}

function tagConditional(rule: ConditionalFormatRule, root: string, palette: PaletteTemplateId): ConditionalFormatRule {
	const tagged = structuredClone(rule);
	tagged.id = `${root}::${rule.id}`;
	tagged.scope = root;
	tagged.color = tagChoice(tagged.color, palette);
	if (tagged.backgroundColor) tagged.backgroundColor = tagChoice(tagged.backgroundColor, palette);
	if (tagged.border) tagged.border.color = tagChoice(tagged.border.color, palette);
	return tagged;
}

/**
 * Builds the settings that the explorer shows: this vault's settings plus the
 * rules of each nested vault, moved under that vault's folder.
 * A deeper vault wins over an outer one inside its folder. A rule saved in this
 * vault for an exact path wins over all nested rules.
 */
export function mergeNestedLayers(own: FolderToolkitSettings, layers: readonly NestedVaultLayer[]): FolderToolkitSettings {
	if (layers.length === 0) return own;
	const ordered = [...layers].sort((first, second) => depth(first.root) - depth(second.root));
	const appearanceRules: Record<string, AppearanceRule> = {};
	const conditionalFormats = [...own.conditionalFormats];
	for (const { root, settings } of ordered) {
		const palette = settings.paletteTemplateId;
		for (const [path, rule] of Object.entries(settings.appearanceRules)) {
			appearanceRules[`${root}/${path}`] = tagAppearancePalette(rule, palette);
		}
		for (const rule of settings.conditionalFormats) conditionalFormats.push(tagConditional(rule, root, palette));
	}
	Object.assign(appearanceRules, own.appearanceRules);
	return { ...own, appearanceRules, conditionalFormats };
}

/** The deepest nested vault root that contains `path`. A vault's own root folder belongs to the vault around it. */
export function ownerRoot(path: string, roots: Iterable<string>): string | null {
	let best: string | null = null;
	for (const root of roots) {
		if (path.startsWith(`${root}/`) && (best === null || root.length > best.length)) best = root;
	}
	return best;
}

/** Moves the rules of `oldPath` and its descendants to `newPath`. Returns null when nothing matched. */
export function renameRules(
	rules: Record<string, AppearanceRule>,
	oldPath: string,
	newPath: string,
): Record<string, AppearanceRule> | null {
	let changed = false;
	const result: Record<string, AppearanceRule> = {};
	for (const [path, rule] of Object.entries(rules)) {
		const next = replacePathRoot(path, oldPath, newPath);
		if (next !== path) changed = true;
		result[next] = rule;
	}
	return changed ? result : null;
}

/**
 * Finds vaults that are folders inside this vault, reads their Folder Toolkit
 * settings, and saves folder appearance into the vault that owns the folder.
 */
export class NestedVaultStore {
	/** Folder path → whether it holds a vault configuration folder. */
	private readonly probes = new Map<string, Promise<boolean>>();
	private readonly vaultRoots = new Set<string>();
	private readonly layers = new Map<string, NestedVaultLayer & { mtime: number }>();
	private writeQueue: Promise<unknown> = Promise.resolve();
	private mergedFor: { own: FolderToolkitSettings; result: FolderToolkitSettings } | null = null;

	constructor(
		private readonly files: VaultFiles,
		private readonly configDir: string,
		private readonly pluginId: string,
		private readonly onChange: () => void,
	) {}

	/** Call after this vault's own settings change in place. */
	invalidate(): void {
		this.mergedFor = null;
	}

	/** The settings that the explorer shows. The result is cached until a layer changes or `invalidate()` runs. */
	effective(own: FolderToolkitSettings): FolderToolkitSettings {
		if (!own.nestedVaults) return own;
		if (this.mergedFor?.own !== own) {
			this.mergedFor = { own, result: mergeNestedLayers(own, [...this.layers.values()]) };
		}
		return this.mergedFor.result;
	}

	/** True when `path` is a folder already found to be a nested vault. */
	isKnownVaultRoot(path: string): boolean {
		return this.vaultRoots.has(path);
	}

	/** The stored, untagged settings of a nested vault, or null when it has none. */
	layer(root: string): FolderToolkitSettings | null {
		return this.layers.get(root)?.settings ?? null;
	}

	/** Checks folders that the explorer shows. Each folder is checked once. */
	probe(folderPaths: Iterable<string>): void {
		for (const path of folderPaths) {
			if (!path || path === '/' || this.probes.has(path)) continue;
			void this.isVaultRoot(path).then(async (isVault) => {
				if (isVault) await this.loadLayer(path);
			});
		}
	}

	/** Reads again each nested settings file whose modified time changed. */
	async refresh(): Promise<void> {
		await Promise.all([...this.vaultRoots].map((root) => this.loadLayer(root)));
	}

	/** Forgets cached vaults at or below `path`, after a rename or delete. */
	forget(path: string): void {
		let changed = false;
		for (const probed of [...this.probes.keys()]) {
			if (isSameOrDescendant(probed, path)) this.probes.delete(probed);
		}
		for (const root of [...this.vaultRoots]) {
			if (!isSameOrDescendant(root, path)) continue;
			this.vaultRoots.delete(root);
			if (this.layers.delete(root)) changed = true;
		}
		if (changed) this.changed();
	}

	/** Finds the vault that owns `path`: the nearest parent folder that is a vault with Folder Toolkit. */
	async ownerOf(path: string): Promise<AppearanceOwner> {
		for (const parent of parentPaths(path)) {
			if (!(await this.isVaultRoot(parent))) continue;
			if (!(await this.files.exists(this.pluginDir(parent)))) {
				return { root: null, relativePath: path, skippedVault: parent };
			}
			return { root: parent, relativePath: path.slice(parent.length + 1) };
		}
		return { root: null, relativePath: path };
	}

	/** Saves or removes one rule in a nested vault's settings file, then reloads that vault. */
	async writeRule(root: string, relativePath: string, rule: AppearanceRule | null): Promise<void> {
		await this.mutate(root, (rules) => {
			if (rule && Object.keys(rule).length > 0) rules[relativePath] = structuredClone(rule);
			else delete rules[relativePath];
			return true;
		});
	}

	/** Applies `edit` to the appearance rules of a nested vault. `edit` returns false when it changed nothing. */
	async mutate(root: string, edit: (rules: Record<string, AppearanceRule>) => boolean): Promise<void> {
		const task = this.writeQueue.then(async () => {
			const path = this.dataPath(root);
			// Read the file again just before the write, so that a change from that vault's own window is kept.
			const raw: Record<string, unknown> = await this.files.exists(path)
				? parseSettingsFile(await this.files.read(path), path)
				: structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
			const rules = isRecord(raw.appearanceRules) ? raw.appearanceRules as Record<string, AppearanceRule> : {};
			if (!edit(rules)) return;
			raw.appearanceRules = rules;
			await this.files.write(path, JSON.stringify(raw, null, 2));
			await this.loadLayer(root, true);
		});
		this.writeQueue = task.catch(() => undefined);
		await task;
	}

	private isVaultRoot(path: string): Promise<boolean> {
		let probe = this.probes.get(path);
		if (!probe) {
			probe = this.files.exists(`${path}/${this.configDir}`).catch(() => false);
			this.probes.set(path, probe);
		}
		return probe.then((isVault) => {
			if (isVault && !this.vaultRoots.has(path)) {
				this.vaultRoots.add(path);
				// The explorer marks vault folders, so a new vault needs a redraw even without settings.
				this.changed();
			}
			return isVault;
		});
	}

	private async loadLayer(root: string, force = false): Promise<void> {
		const path = this.dataPath(root);
		const stat = await this.files.stat(path).catch(() => null);
		const current = this.layers.get(root);
		if (!stat) {
			if (current) {
				this.layers.delete(root);
				this.changed();
			}
			return;
		}
		if (!force && current?.mtime === stat.mtime) return;
		try {
			const settings = normalizeSettings(parseSettingsFile(await this.files.read(path), path));
			this.layers.set(root, { root, settings, mtime: stat.mtime });
			this.changed();
		} catch (error) {
			console.warn(`Folder Toolkit: could not read the settings of the nested vault "${root}".`, error);
		}
	}

	private changed(): void {
		this.mergedFor = null;
		this.onChange();
	}

	private pluginDir(root: string): string {
		return `${root}/${this.configDir}/plugins/${this.pluginId}`;
	}

	private dataPath(root: string): string {
		return `${this.pluginDir(root)}/data.json`;
	}
}

function parseSettingsFile(text: string, path: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(text);
	if (!isRecord(parsed)) throw new Error(`${path} does not hold a settings object.`);
	return parsed;
}
