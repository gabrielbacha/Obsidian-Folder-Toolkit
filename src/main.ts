import { hasOwn } from './record-utils';
import { Menu, Notice, Plugin, TAbstractFile, TFolder, type App } from 'obsidian';
import { ExplorerManager } from './explorer-manager';
import { AppearancePreviewStore } from './appearance-preview';
import { normalizePaletteTemplateId, paletteTemplate } from './colors';
import { NestedVaultStore, tagAppearancePalette, type AppearanceOwner } from './nested-vaults';
import { findNearestContainingPath, isSameOrDescendant, replacePathRoot } from './path-utils';
import { publishSettings } from './settings-writer';
import { normalizeSettings } from './settings';
import {
	OWN_RULE_KEY,
	collectAppearance,
	findMissingRoots,
	parseAppearance,
	planPaste,
	reattachRules,
	removeRulesUnder,
	serializeAppearance,
	type CopiedAppearance,
	type MissingRoot,
} from './rule-transfer';
import { TabManager, tabVisibility } from './tab-manager';
import {
	TAB_STYLES, VAULT_MARKERS,
	type AppearanceRule, type ConditionalFormatRule, type FolderToolkitSettings, type PaletteTemplateId, type SavedPreset, type TabStyle, type VaultMarker,
} from './types';
import { appearanceForItem } from './appearance-presets';
import { AppearanceModal, type AppearanceTarget } from './ui/appearance-modal';
import { addSubmenu, appearanceMenuEntries, type AppearanceMenuHost } from './ui/appearance-menu';
import { MissingItemsModal } from './ui/missing-items-modal';
import { PresetNameModal } from './ui/preset-name-modal';

import { FolderToolkitSettingTab } from './ui/settings-tab';

export default class FolderToolkitPlugin extends Plugin {
	settings!: FolderToolkitSettings;
	private explorer!: ExplorerManager;
	private tabs!: TabManager;
	private settingTab!: FolderToolkitSettingTab;
	private focusPath: string | null = null;
	private readonly appearancePreview = new AppearancePreviewStore();
	private nested!: NestedVaultStore;
	private saveQueue: Promise<unknown> = Promise.resolve();
	private requestedSettings: FolderToolkitSettings | null = null;
	private settingsGeneration = 0;
	private managedPathsEpoch = 0;
	private settingsReadOnlyError: string | null = null;
	private unloaded = false;
	private appearanceEditors: Set<AppearanceModal> | undefined;
	private renameQueue: Promise<unknown> = Promise.resolve();

	async onload(): Promise<void> {
		try { this.settings = normalizeSettings(await this.loadData()); }
		catch (error) {
			this.settingsReadOnlyError = error instanceof Error ? error.message : String(error);
			new Notice(this.settingsReadOnlyError);
			this.settings = normalizeSettings(null);
		}
		this.requestedSettings = structuredClone(this.settings);
		this.nested = new NestedVaultStore(this.app.vault.adapter, this.app.vault.configDir, this.manifest.id, () => {
			this.explorer?.reconcileSoon();
			this.tabs?.reconcileSoon();
		});
		this.explorer = new ExplorerManager(
			this.app,
			() => this.effectiveSettings(),
			() => this.focusPath,
			{
				probe: (folderPaths) => { if (this.settings.nestedVaults) this.nested.probe(folderPaths); },
				isVaultRoot: (path) => this.settings.nestedVaults && this.nested.isKnownVaultRoot(path),
			},
		);
		this.tabs = new TabManager(this.app, () => this.effectiveSettings());

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.addFileMenu(menu, file)));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.explorer.syncLeaves();
			this.tabs.reconcileSoon();
		}));
		this.registerEvent(this.app.workspace.on('file-open', () => this.tabs.reconcileSoon()));
		this.registerEvent(this.app.vault.on('create', () => { this.managedPathsEpoch += 1; }));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => { this.managedPathsEpoch += 1; void this.handleRename(file, oldPath); }));
		this.registerEvent(this.app.vault.on('delete', (file) => { this.managedPathsEpoch += 1; void this.handleDelete(file); }));
		// A nested vault's settings change when it is edited in its own window. Read them again when this window gets focus.
		this.registerDomEvent(window, 'focus', () => void this.refreshNestedVaults());

		this.addCommand({
			id: 'toggle-hidden-items',
			name: 'Toggle hidden items',
			callback: () => void this.toggleHiddenItems(),
		});
		this.addCommand({
			id: 'exit-folder-focus',
			name: 'Exit folder focus',
			checkCallback: (checking) => {
				if (!this.focusPath) return false;
				if (!checking) this.exitFocus();
				return true;
			},
		});

		this.addCommand({
			id: 'reload-nested-vault-appearance',
			name: 'Reload appearance from nested vaults',
			callback: () => void this.refreshNestedVaults(),
		});

		this.addCommand({
			id: 'relink-missing-items',
			name: 'Relink missing items',
			callback: () => this.relinkMissingItems(),
		});

		this.addCommand({
			id: 'toggle-note-tab-colors',
			name: 'Toggle note tab colors',
			callback: () => void this.toggleTabColors(),
		});

		this.addCommand({
			id: 'open-conditional-formatting',
			name: 'Open conditional formatting rules',
			callback: () => this.openConditionalFormatting(),
		});

		this.settingTab = new FolderToolkitSettingTab(this);
		this.addSettingTab(this.settingTab);
		this.app.workspace.onLayoutReady(() => {
			this.explorer.start();
			this.tabs.start();
		});
	}

	/** Obsidian calls this when this vault's `data.json` changes on disk, for example from Sync or from an outer vault. */
	async onExternalSettingsChange(): Promise<void> {
		const generation = this.settingsGeneration;
		const load = (this.saveQueue ?? Promise.resolve()).then(async () => {
			try {
				const settings = normalizeSettings(await this.loadData());
				if (this.unloaded || generation !== this.settingsGeneration) return;
				this.settings = settings;
				this.requestedSettings = structuredClone(settings);
				this.settingsReadOnlyError = null;
				this.nested.invalidate();
				this.explorer.reconcileSoon();
				this.tabs.reconcileSoon();
			} catch (error) {
				if (this.unloaded || generation !== this.settingsGeneration) return;
				this.settingsReadOnlyError = error instanceof Error ? error.message : String(error);
				new Notice(this.settingsReadOnlyError);
			}
		});
		this.saveQueue = load.catch(() => undefined);
		await load;
	}

	onunload(): void {
		this.unloaded = true;
		for (const editor of [...this.appearanceEditors ?? []]) editor.close();
		this.appearanceEditors?.clear();
		this.nested?.dispose();
		this.appearancePreview.clearAll();
		this.explorer?.stop();
		this.tabs?.stop();
	}

	openConditionalFormatting(): void {
		const modal = settingsModal(this.app);
		if (!modal) {
			new Notice('Could not open the conditional formatting settings.');
			return;
		}
		modal.open();
		modal.openTabById(this.manifest.id);
		this.settingTab.revealConditionalFormats();
	}

	managedPathsRevision(): string { return `${this.settingsGeneration ?? 0}:${this.managedPathsEpoch ?? 0}`; }

	/** The settings that the explorer and tabs show: this vault, nested vaults, and open previews. */
	effectiveSettings(): FolderToolkitSettings {
		return this.appearancePreview.apply(this.nested?.effective(this.settings) ?? this.settings);
	}

	/** Finds the vault that stores the appearance of `path` and its current rule there. */
	async appearanceTarget(path: string): Promise<AppearanceTarget> {
		const owner: AppearanceOwner = !hasOwn(this.settings.appearanceRules, path) && this.settings.nestedVaults
			? await this.nested.ownerOf(path)
			: { root: null, relativePath: path };
		if (owner.root === null) {
			return { owner, paletteTemplateId: this.settings.paletteTemplateId, rule: this.settings.appearanceRules[path] };
		}
		const layer = this.nested.layer(owner.root);
		return {
			owner,
			paletteTemplateId: layer?.paletteTemplateId ?? 'default',
			rule: layer?.appearanceRules[owner.relativePath],
		};
	}

	async openAppearanceEditor(path: string, onSaved?: () => void): Promise<void> {
		if (this.unloaded) return;
		const originalItem = this.app.vault.getAbstractFileByPath(path);
		try {
			const target = await this.appearanceTarget(path);
			if (this.unloaded) return;
			if (!originalItem || this.app.vault.getAbstractFileByPath(path) !== originalItem || originalItem.path !== path) {
				new Notice('This item moved or changed. Reopen its appearance editor.'); return;
			}
			new AppearanceModal(this, path, onSaved, target).open();
		} catch (error) {
			if (this.unloaded) return;
			console.error('Folder Toolkit: could not open the appearance editor.', error);
			new Notice('Could not read the appearance settings for this item.');
		}
	}

	registerAppearanceEditor(editor: AppearanceModal): void { (this.appearanceEditors ??= new Set()).add(editor); }
	unregisterAppearanceEditor(editor: AppearanceModal): void { this.appearanceEditors?.delete(editor); }

	/** Saves `rule` for `path`. With a nested `owner`, the rule is saved in that vault's settings. */
	async setAppearance(path: string, rule: AppearanceRule, owner?: AppearanceOwner): Promise<void> {
		if (owner?.root) {
			await this.nested.writeRule(owner.root, owner.relativePath, rule);
			return;
		}
		if (Object.keys(rule).length === 0) delete this.settings.appearanceRules[path];
		else this.settings.appearanceRules[path] = structuredClone(rule);
		await this.persist();
	}

	async removeAppearance(path: string): Promise<void> {
		delete this.settings.appearanceRules[path];
		await this.persist();
	}

	/** Rules saved in this vault whose file or folder no longer exists, grouped by the topmost missing path. */
	missingAppearanceRoots(): MissingRoot[] {
		return findMissingRoots(this.settings.appearanceRules, (path) => this.app.vault.getAbstractFileByPath(path) !== null);
	}

	/** Opens the dialog that lists missing items, where each can be reattached or removed. */
	relinkMissingItems(): void {
		new MissingItemsModal(this).open();
	}

	/** Moves the rules of a missing item and its descendants to `newPath`. */
	async reattachAppearance(oldPath: string, newPath: string): Promise<void> {
		const { rules, moved, skipped } = reattachRules(this.settings.appearanceRules, oldPath, newPath);
		this.settings.appearanceRules = rules;
		await this.persist();
		const kept = skipped > 0 ? ` ${skipped} kept the rule that ${newPath} already had.` : '';
		new Notice(`Moved ${moved} appearance ${moved === 1 ? 'rule' : 'rules'} to ${newPath}.${kept}`);
	}

	/** Removes the rules of `path` and everything below it from this vault. */
	async removeAppearanceUnder(path: string): Promise<void> {
		this.settings.appearanceRules = removeRulesUnder(this.settings.appearanceRules, path);
		await this.persist();
	}

	/**
	 * Copies the appearance of `path` and of every styled item below it to the clipboard,
	 * with relative paths. `ownRule` replaces the saved rule of `path`, so that the editor
	 * can copy what it shows, including unsaved changes.
	 */
	async copyAppearance(path: string, ownRule?: AppearanceRule): Promise<void> {
		const copied = collectAppearance(this.savedAppearanceRules(), path);
		if (ownRule !== undefined) {
			if (Object.keys(ownRule).length > 0) copied[OWN_RULE_KEY] = structuredClone(ownRule);
			else delete copied[OWN_RULE_KEY];
		}
		const count = Object.keys(copied).length;
		if (count === 0) {
			new Notice('This item has no appearance to copy.');
			return;
		}
		try {
			await navigator.clipboard.writeText(serializeAppearance(copied));
			new Notice(`Copied ${count} appearance ${count === 1 ? 'rule' : 'rules'}. Paste them in the appearance editor of any file or folder, in this vault or another.`);
		} catch (error) {
			console.error('Folder Toolkit: could not write to the clipboard.', error);
			new Notice('Could not copy the appearance to the clipboard.');
		}
	}

	/** Reads appearance copied by Folder Toolkit from the clipboard. Shows a notice and returns null when there is none. */
	async readCopiedAppearance(): Promise<CopiedAppearance | null> {
		let text: string;
		try {
			text = await navigator.clipboard.readText();
		} catch (error) {
			console.error('Folder Toolkit: could not read the clipboard.', error);
			new Notice('Could not read the clipboard.');
			return null;
		}
		const copied = parseAppearance(text, paletteTemplate(this.settings.paletteTemplateId).colors.length);
		if (!copied) new Notice('The clipboard has no copied appearance.');
		return copied;
	}

	/** Saves copied rules for the items below `path` that exist. Returns how many were saved and skipped. */
	async pasteDescendantAppearance(path: string, copied: CopiedAppearance): Promise<{ saved: number; skipped: number }> {
		const descendants = Object.fromEntries(Object.entries(copied).filter(([key]) => key !== OWN_RULE_KEY));
		const { writes, skipped } = planPaste(descendants, path, (candidate) => this.app.vault.getAbstractFileByPath(candidate) !== null);
		const nestedWrites = new Map<string, Record<string, AppearanceRule>>();
		let ownChanged = false;
		for (const [targetPath, rule] of Object.entries(writes)) {
			const owner = this.settings.nestedVaults ? await this.nested.ownerOf(targetPath) : { root: null, relativePath: targetPath };
			if (owner.root === null) {
				this.settings.appearanceRules[targetPath] = rule;
				ownChanged = true;
			} else {
				const group = nestedWrites.get(owner.root) ?? Object.create(null) as Record<string, AppearanceRule>;
				group[owner.relativePath] = rule;
				nestedWrites.set(owner.root, group);
			}
		}
		if (ownChanged) await this.persist();
		for (const [root, group] of nestedWrites) {
			await this.nested.mutate(root, (rules) => {
				Object.assign(rules, structuredClone(group));
				return true;
			});
		}
		return { saved: Object.keys(writes).length, skipped };
	}

	/** Saved rules of this vault and nested vaults, without unsaved previews. */
	private savedAppearanceRules(): Record<string, AppearanceRule> {
		return this.nested.effective(this.settings).appearanceRules;
	}

	/** Shows `rule` before it is saved. `palette` is the palette of a nested vault that owns `path`. */
	previewAppearance(path: string, rule: AppearanceRule, palette?: PaletteTemplateId): void {
		if (this.unloaded) return;
		this.appearancePreview.set(path, palette ? tagAppearancePalette(rule, palette) : rule);
		this.explorer.reconcileSoon();
	}

	clearAppearancePreview(path: string): void {
		this.appearancePreview.clear(path);
		if (!this.unloaded) this.explorer.reconcileSoon();
	}

	async hidePath(path: string): Promise<void> {
		if (this.focusPath && isSameOrDescendant(this.focusPath, path)) this.exitFocus(false);
		if (!this.settings.hiddenPaths.includes(path)) this.settings.hiddenPaths.push(path);
		await this.persist();
	}

	async unhidePath(path: string): Promise<void> {
		this.settings.hiddenPaths = this.settings.hiddenPaths.filter((hiddenPath) => hiddenPath !== path);
		await this.persist();
	}

	async setShowHiddenItems(value: boolean): Promise<void> {
		this.settings.showHiddenItems = value;
		await this.persist();
	}

	async setPalette(value: string): Promise<void> {
		this.settings.paletteTemplateId = normalizePaletteTemplateId(value);
		await this.persist();
	}

	async setNestedVaults(value: boolean): Promise<void> {
		this.settings.nestedVaults = value;
		await this.persist();
		if (value) this.explorer.syncLeaves();
	}

	async setVaultMarker(value: string): Promise<void> {
		this.settings.vaultMarker = VAULT_MARKERS.includes(value as VaultMarker) ? value as VaultMarker : 'both';
		await this.persist();
	}

	async refreshNestedVaults(): Promise<void> {
		if (this.settings.nestedVaults) await this.nested.refresh();
	}

	async setTabStyle(value: string): Promise<void> {
		const style = TAB_STYLES.includes(value as TabStyle) ? value as TabStyle : 'off';
		this.settings.tabStyle = style;
		if (style !== 'off') this.settings.tabStyleWhenOn = style;
		await this.persist();
	}

	/** Turns note tab colors off, or back on with the style used last. */
	async toggleTabColors(): Promise<void> {
		const on = this.settings.tabStyle === 'off';
		await this.setTabStyle(on ? this.settings.tabStyleWhenOn : 'off');
		new Notice(on ? 'Note tab colors are on.' : 'Note tab colors are off.');
	}

	/** Whether the tab of `path` shows its colors, from saved rules and open previews. */
	showsOnTabs(path: string): boolean {
		return tabVisibility(path, this.effectiveSettings().appearanceRules).visible;
	}

	/** Makes the tab of `path` show or hide its colors. A choice equal to the inherited one removes the item's own setting. */
	async setItemTabs(path: string, visible: boolean): Promise<void> {
		const target = await this.appearanceTarget(path);
		const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
		const inherited = parent ? tabVisibility(parent, this.savedAppearanceRules()).visible : true;
		const rule = structuredClone(target.rule ?? {});
		if (visible === inherited) delete rule.tabs;
		else rule.tabs = visible;
		await this.setAppearance(path, rule, target.owner);
	}

	/** Saves `rule` as a named preset and returns its id. */
	async savePreset(name: string, rule: AppearanceRule): Promise<string> {
		const trimmed = name.trim();
		if (!trimmed) throw new Error('Enter a name.');
		if (Object.keys(rule).length === 0) throw new Error('This appearance is empty. Set a style before you save it as a preset.');
		const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.settings.savedPresets.push({ id, name: trimmed, rule: structuredClone(rule) });
		await this.persist();
		new Notice(`Saved preset “${trimmed}”.`);
		return id;
	}

	async renamePreset(id: string, name: string): Promise<void> {
		const preset = this.settings.savedPresets.find((candidate) => candidate.id === id);
		const trimmed = name.trim();
		if (!preset || !trimmed || preset.name === trimmed) return;
		preset.name = trimmed;
		await this.persist();
	}

	async deletePreset(id: string): Promise<void> {
		const remaining = this.settings.savedPresets.filter((preset) => preset.id !== id);
		if (remaining.length === this.settings.savedPresets.length) return;
		this.settings.savedPresets = remaining;
		await this.persist();
	}

	/** Opens the name dialog and saves the saved rule of `path` as a preset. */
	promptSavePreset(path: string, rule?: AppearanceRule, onSaved?: () => void): void {
		const source = rule ?? this.savedAppearanceRules()[path];
		if (!source || Object.keys(source).length === 0) {
			new Notice('This item has no appearance to save as a preset.');
			return;
		}
		new PresetNameModal(this.app, {
			title: 'Save appearance as preset',
			initialName: path.split('/').at(-1)?.replace(/\.md$/i, '') ?? '',
			onSubmit: async (name) => { await this.savePreset(name, source); onSaved?.(); },
		}).open();
	}

	/** Saves a preset's appearance for `path`, replacing the item's own rule. */
	async applyPreset(path: string, id: string): Promise<void> {
		const preset = this.settings.savedPresets.find((candidate) => candidate.id === id);
		if (!preset) {
			new Notice('This preset no longer exists.');
			return;
		}
		await this.replaceOwnRule(path, appearanceForItem(preset.rule, this.isFolderPath(path)));
		new Notice(`Applied preset “${preset.name}”.`);
	}

	/** Pastes copied appearance onto `path` without opening the editor. */
	async pasteAppearance(path: string): Promise<void> {
		const copied = await this.readCopiedAppearance();
		if (!copied) return;
		const isFolder = this.isFolderPath(path);
		const own = copied[OWN_RULE_KEY];
		const hasDescendants = Object.keys(copied).some((key) => key !== OWN_RULE_KEY);
		if (!own && !(isFolder && hasDescendants)) {
			new Notice('The copied appearance has no style for this item.');
			return;
		}
		if (own) await this.replaceOwnRule(path, appearanceForItem(own, isFolder));
		let saved = own ? 1 : 0;
		let skipped = 0;
		if (isFolder && hasDescendants) {
			const result = await this.pasteDescendantAppearance(path, copied);
			saved += result.saved;
			skipped = result.skipped;
		}
		const skippedText = skipped > 0 ? ` ${skipped} skipped because the item does not exist here.` : '';
		new Notice(`Pasted ${saved} appearance ${saved === 1 ? 'style' : 'styles'}.${skippedText}`);
	}

	/** Removes the own rule of `path`, so it shows inherited and name-rule styles again. */
	async resetAppearance(path: string): Promise<void> {
		const target = await this.appearanceTarget(path);
		if (!target.rule) {
			new Notice('This item already uses the inherited appearance.');
			return;
		}
		await this.setAppearance(path, {}, target.owner);
		new Notice('Appearance reset to inherited.');
	}

	private async replaceOwnRule(path: string, rule: AppearanceRule): Promise<void> {
		const target = await this.appearanceTarget(path);
		await this.setAppearance(path, rule, target.owner);
	}

	private isFolderPath(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(path) instanceof TFolder;
	}

	private appearanceMenuHost(): AppearanceMenuHost {
		return {
			savedPresets: (): SavedPreset[] => this.settings.savedPresets,
			hasOwnRule: (path) => hasOwn(this.savedAppearanceRules(), path),
			showsOnTabs: (path) => this.showsOnTabs(path),
			tabColorsOn: () => this.settings.tabStyle !== 'off',
			copyAppearance: (path) => this.copyAppearance(path),
			pasteAppearance: (path) => this.pasteAppearance(path),
			promptSavePreset: (path) => this.promptSavePreset(path),
			applyPreset: (path, id) => this.applyPreset(path, id),
			resetAppearance: (path) => this.resetAppearance(path),
			setItemTabs: (path, visible) => this.setItemTabs(path, visible),
			toggleTabColors: () => this.toggleTabColors(),
		};
	}

	previewConditionalFormat(rule: ConditionalFormatRule): void {
		this.appearancePreview.setConditional(rule);
		this.explorer.reconcileSoon();
	}

	clearConditionalFormatPreview(id: string): void {
		this.appearancePreview.clearConditional(id);
		this.explorer.reconcileSoon();
	}

	async addConditionalFormat(): Promise<string> {
		const id = `conditional-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.settings.conditionalFormats.push({
			id,
			target: 'folder',
			match: 'equals',
			pattern: '',
			fontEnabled: true,
			color: { kind: 'custom', hex: '#FFFFFF', strength: 100 },
			backgroundEnabled: false,
			backgroundColor: { kind: 'custom', hex: '#A8ADB5', strength: 20 },
			borderEnabled: false,
			border: { style: 'box', color: { kind: 'preset', slot: 0, strength: 42 }, thickness: 'thin' },
			bold: false,
			strikethrough: false,
		});
		await this.persist();
		return id;
	}

	async updateConditionalFormat(id: string, rule: ConditionalFormatRule): Promise<void> {
		const index = this.settings.conditionalFormats.findIndex((candidate) => candidate.id === id);
		if (index < 0) return;
		this.settings.conditionalFormats[index] = structuredClone(rule);
		await this.persist();
	}

	/** Copies a saved name rule and inserts the copy right after it. Returns the copy's id. */
	async duplicateConditionalFormat(id: string): Promise<string | null> {
		const index = this.settings.conditionalFormats.findIndex((rule) => rule.id === id);
		const original = this.settings.conditionalFormats[index];
		if (!original) return null;
		const copyId = `conditional-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.settings.conditionalFormats.splice(index + 1, 0, { ...structuredClone(original), id: copyId });
		await this.persist();
		return copyId;
	}

	async moveConditionalFormat(id: string, direction: -1 | 1): Promise<void> {
		const index = this.settings.conditionalFormats.findIndex((rule) => rule.id === id);
		const target = index + direction;
		if (index < 0 || target < 0 || target >= this.settings.conditionalFormats.length) return;
		const [rule] = this.settings.conditionalFormats.splice(index, 1);
		if (!rule) return;
		this.settings.conditionalFormats.splice(target, 0, rule);
		await this.persist();
	}
	async removeConditionalFormat(id: string): Promise<void> {
		this.settings.conditionalFormats = this.settings.conditionalFormats.filter((rule) => rule.id !== id);
		this.appearancePreview.clearConditional(id);
		await this.persist();
	}

	findHiddenAncestor(path: string): string | null {
		return findNearestContainingPath(path, this.settings.hiddenPaths);
	}

	focusFolder(path: string): void {
		this.focusPath = path;
		this.explorer.reconcileSoon();
		new Notice(`Focused folder: ${path}. Use “Exit folder focus” to restore the explorer.`);
	}

	exitFocus(showNotice = true): void {
		if (!this.focusPath) return;
		this.focusPath = null;
		this.explorer.reconcileSoon();
		if (showNotice) new Notice('Folder focus cleared.');
	}

	private addFileMenu(menu: Menu, file: TAbstractFile): void {
		menu.addItem((item) => item
			.setTitle(`Edit ${file instanceof TFolder ? 'folder' : 'file'} appearance…`)
			.setIcon('palette')
			.onClick(() => void this.openAppearanceEditor(file.path)));
		addSubmenu(menu, 'Appearance', 'paintbrush', appearanceMenuEntries(file.path, this.appearanceMenuHost()));

		const hiddenAncestor = this.findHiddenAncestor(file.path);
		if (hiddenAncestor) {
			const title = hiddenAncestor === file.path
				? `Unhide ${file instanceof TFolder ? 'folder' : 'file'}`
				: `Unhide parent folder “${hiddenAncestor.split('/').at(-1) ?? hiddenAncestor}”`;
			menu.addItem((item) => item
				.setTitle(title)
				.setIcon('eye')
				.onClick(() => void this.unhidePath(hiddenAncestor)));
		} else {
			menu.addItem((item) => item
				.setTitle(`Hide ${file instanceof TFolder ? 'folder' : 'file'}`)
				.setIcon('eye-off')
				.onClick(() => void this.hidePath(file.path)));
		}

		if (file instanceof TFolder) {
			menu.addItem((item) => item
				.setTitle(this.focusPath === file.path ? 'Refocus this folder' : 'Focus this folder')
				.setIcon('scan')
				.onClick(() => this.focusFolder(file.path)));
			if (this.focusPath) {
				menu.addItem((item) => item
					.setTitle('Exit folder focus')
					.setIcon('scan-line')
					.onClick(() => this.exitFocus()));
			}
		}
	}

	private async toggleHiddenItems(): Promise<void> {
		await this.setShowHiddenItems(!this.settings.showHiddenItems);
		new Notice(this.settings.showHiddenItems ? 'Hidden items are visible.' : 'Hidden items are hidden.');
	}

	private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
		const newPath = file.path;
		const task = (this.renameQueue ?? Promise.resolve()).then(async () => {
			if (this.unloaded) return;
			await this.performRename({ path: newPath } as TAbstractFile, oldPath);
		});
		this.renameQueue = task.catch(() => undefined);
		await task;
	}

	private async performRename(file: TAbstractFile, oldPath: string): Promise<void> {
		this.appearancePreview.clearSubtree(oldPath);
		let changed = false;
		const remapped: Record<string, AppearanceRule> = Object.create(null) as Record<string, AppearanceRule>;
		for (const [path, rule] of Object.entries(this.settings.appearanceRules)) {
			const nextPath = replacePathRoot(path, oldPath, file.path);
			if (nextPath !== path) changed = true;
			remapped[nextPath] = rule;
		}
		this.settings.appearanceRules = remapped;
		this.settings.hiddenPaths = this.settings.hiddenPaths.map((path) => {
			const nextPath = replacePathRoot(path, oldPath, file.path);
			if (nextPath !== path) changed = true;
			return nextPath;
		});
		if (this.focusPath) this.focusPath = replacePathRoot(this.focusPath, oldPath, file.path);
		if (changed) await this.persist();
		else {
			this.explorer.reconcileSoon();
			this.tabs.reconcileSoon();
		}
		if (this.settings.nestedVaults) await this.renameNestedRules(oldPath, file.path);
	}

	/**
	 * Moves nested-vault rules after a rename made in this vault. The rules come from the
	 * cached copy, because the nested vault's own window sees the rename as a delete and
	 * can remove them from its file first. The move has a durable request and runs once in rename-event order.
	 * It never replays a captured path after a later rename or unload.
	 */
	private async renameNestedRules(oldPath: string, newPath: string): Promise<void> {
		const oldLayerRoots = this.nestedRootsAt(oldPath);
		this.nested.forget(oldPath);
		const [from, to] = await Promise.all([this.nested.ownerOf(oldPath), this.nested.ownerOf(newPath)]);
		if (from.root === null && to.root === null) return;

		const moved: Record<string, AppearanceRule> = Object.create(null) as Record<string, AppearanceRule>;
		if (from.root !== null) {
			for (const [path, rule] of Object.entries(oldLayerRoots.get(from.root)?.appearanceRules ?? {})) {
				if (isSameOrDescendant(path, from.relativePath)) moved[path.slice(from.relativePath.length)] = rule;
			}
		} else {
			// Rules saved in this vault were already moved to `newPath` above.
			for (const [path, rule] of Object.entries(this.settings.appearanceRules)) {
				if (isSameOrDescendant(path, newPath)) moved[path.slice(newPath.length)] = rule;
			}
		}
		if (Object.keys(moved).length === 0) return;
		const intentPath = `${this.settingsDirectory()}/move-${crypto.randomUUID()}.json`;
		await this.app.vault.adapter.write(intentPath, JSON.stringify({ version: 1, oldPath, newPath, from, to, sourceRules: moved, state: 'prepared' }));

		const apply = async (): Promise<void> => {
			const fromRoot = from.root;
			const toRoot = to.root;
			const oldKey = (suffix: string) => `${from.relativePath}${suffix}`;
			const newKey = (suffix: string) => `${toRoot === null ? newPath : to.relativePath}${suffix}`;
			const addMissing = (rules: Record<string, AppearanceRule>): boolean => {
				let changed = false;
				for (const [suffix, rule] of Object.entries(moved)) {
					if (hasOwn(rules, newKey(suffix))) continue;
					rules[newKey(suffix)] = structuredClone(rule);
					changed = true;
				}
				return changed;
			};
			const removeOld = (rules: Record<string, AppearanceRule>, keys: string[]): boolean => {
				let changed = false;
				for (const key of keys) {
					if (!hasOwn(rules, key)) continue;
					const suffix = key.startsWith(from.relativePath) ? key.slice(from.relativePath.length) : key.slice(newPath.length);
					if (JSON.stringify(rules[key]) !== JSON.stringify(moved[suffix])) continue;
					delete rules[key];
					changed = true;
				}
				return changed;
			};
			const suffixes = Object.keys(moved);

			if (fromRoot !== null && fromRoot === toRoot) {
				await this.nested.mutate(fromRoot, (rules) => {
					const added = addMissing(rules);
					const confirmed = suffixes.filter((suffix) => JSON.stringify(rules[newKey(suffix)]) === JSON.stringify(moved[suffix]));
					const removed = removeOld(rules, confirmed.map(oldKey).filter((key) => !suffixes.map(newKey).includes(key)));
					return added || removed;
				});
				return;
			}
			// Publish destination first. Its atomic writer confirms the intended rule values.
			if (toRoot !== null) await this.nested.mutate(toRoot, addMissing);
			else if (addMissing(this.settings.appearanceRules)) await this.persist();
			const targetRules = toRoot !== null ? this.nested.layer(toRoot)?.appearanceRules : this.settings.appearanceRules;
			const confirmed = suffixes.filter((suffix) => JSON.stringify(targetRules?.[newKey(suffix)]) === JSON.stringify(moved[suffix]));
			if (confirmed.length !== suffixes.length) new Notice('Existing destination rules were kept. Conflicting source rules remain available for recovery.');
			if (fromRoot !== null) await this.nested.mutate(fromRoot, (rules) => removeOld(rules, confirmed.map(oldKey)));
			else if (removeOld(this.settings.appearanceRules, confirmed.map((suffix) => `${newPath}${suffix}`))) await this.persist();
		};

		try {
			await apply();
			await this.app.vault.adapter.write(intentPath, JSON.stringify({ version: 1, oldPath, newPath, from, to, sourceRules: moved, state: 'published' }));
		} catch (error) {
			console.error('Folder Toolkit: could not move the appearance rules in the nested vault.', error);
			new Notice(`Could not confirm the rule move. Source recovery is retained at ${intentPath}.`);
		}
	}

	/** Cached settings of the nested vaults that own `path` or contain it, read before the caches are cleared. */
	private nestedRootsAt(path: string): Map<string, FolderToolkitSettings> {
		const result = new Map<string, FolderToolkitSettings>();
		for (const root of parentPathsWithSelf(path)) {
			const layer = this.nested.layer(root);
			if (layer) result.set(root, layer);
		}
		return result;
	}

	/**
	 * Keeps appearance rules after a delete. A folder moved outside Obsidian, for example in
	 * Finder or by a sync tool, also arrives as a delete. The rules stay so that they can be
	 * reattached from the missing items list in settings, or removed there.
	 */
	private async handleDelete(file: TAbstractFile): Promise<void> {
		this.appearancePreview.clearSubtree(file.path);
		this.nested?.forget(file.path);
		const oldHiddenCount = this.settings.hiddenPaths.length;
		this.settings.hiddenPaths = this.settings.hiddenPaths.filter((path) => !isSameOrDescendant(path, file.path));
		if (this.focusPath && isSameOrDescendant(this.focusPath, file.path)) {
			this.exitFocus(false);
			new Notice('Folder focus cleared because the focused folder was deleted.');
		}
		if (oldHiddenCount !== this.settings.hiddenPaths.length) {
			await this.persist();
		} else {
			this.explorer.reconcileSoon();
		}
	}

	private settingsDirectory(): string { return this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`; }

	private async persist(): Promise<void> {
		if (this.settingsReadOnlyError) throw new Error(this.settingsReadOnlyError);
		const snapshot = structuredClone(this.settings);

		const generation = this.settingsGeneration = (this.settingsGeneration ?? 0) + 1;
		const task = (this.saveQueue ?? Promise.resolve()).then(async () => {
			if (this.unloaded) throw new Error('Folder Toolkit was unloaded before this save.');
			const path = `${this.settingsDirectory()}/data.json`;
			const base = this.requestedSettings ?? normalizeSettings(await this.loadData());
			const committed = await publishSettings(this.app.vault.adapter, path, base, snapshot, () => !this.unloaded);
			if (this.unloaded) return;
			this.requestedSettings = structuredClone(committed);
			if (generation === this.settingsGeneration) this.settings = committed;
			this.nested?.invalidate();
			this.explorer.reconcileSoon();
			this.tabs.reconcileSoon();
		});
		this.saveQueue = task.catch(() => undefined);
		await task;
	}
}

interface SettingsModal {
	open(): void;
	openTabById(id: string): unknown;
}

/** Obsidian has no public API to open a specific settings tab; use the internal modal when it exists. */
function settingsModal(app: App): SettingsModal | null {
	const modal = (app as App & { setting?: Partial<SettingsModal> }).setting;
	if (typeof modal?.open !== 'function' || typeof modal.openTabById !== 'function') return null;
	return modal as SettingsModal;
}

function parentPathsWithSelf(path: string): string[] {
	const parts = path.split('/');
	return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}
