import { Menu, Notice, Plugin, TAbstractFile, TFolder } from 'obsidian';
import { ExplorerManager } from './explorer-manager';
import { AppearancePreviewStore } from './appearance-preview';
import { normalizePaletteTemplateId } from './colors';
import { findNearestContainingPath, isSameOrDescendant, replacePathRoot } from './path-utils';
import { normalizeSettings } from './settings';
import { TabManager } from './tab-manager';
import type { AppearanceRule, FolderToolkitSettings } from './types';
import { AppearanceModal } from './ui/appearance-modal';
import { FolderToolkitSettingTab } from './ui/settings-tab';

export default class FolderToolkitPlugin extends Plugin {
	settings!: FolderToolkitSettings;
	private explorer!: ExplorerManager;
	private tabs!: TabManager;
	private focusPath: string | null = null;
	private readonly appearancePreview = new AppearancePreviewStore();

	async onload(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		this.explorer = new ExplorerManager(this.app, () => this.appearancePreview.apply(this.settings), () => this.focusPath);
		this.tabs = new TabManager(this.app, () => this.settings);

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.addFileMenu(menu, file)));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this.explorer.syncLeaves();
			this.tabs.reconcileSoon();
		}));
		this.registerEvent(this.app.workspace.on('file-open', () => this.tabs.reconcileSoon()));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => void this.handleRename(file, oldPath)));
		this.registerEvent(this.app.vault.on('delete', (file) => void this.handleDelete(file)));

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

		this.addSettingTab(new FolderToolkitSettingTab(this));
		this.app.workspace.onLayoutReady(() => {
			this.explorer.start();
			this.tabs.start();
		});
	}

	onunload(): void {
		this.appearancePreview.clearAll();
		this.explorer?.stop();
		this.tabs?.stop();
	}

	async setAppearance(path: string, rule: AppearanceRule): Promise<void> {
		if (Object.keys(rule).length === 0) delete this.settings.appearanceRules[path];
		else this.settings.appearanceRules[path] = structuredClone(rule);
		await this.persist();
	}

	async removeAppearance(path: string): Promise<void> {
		delete this.settings.appearanceRules[path];
		await this.persist();
	}

	previewAppearance(path: string, rule: AppearanceRule): void {
		this.appearancePreview.set(path, rule);
		this.explorer.reconcileSoon();
	}

	clearAppearancePreview(path: string): void {
		this.appearancePreview.clear(path);
		this.explorer.reconcileSoon();
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

	async setTabStyle(value: string): Promise<void> {
		this.settings.tabStyle = value === 'background' || value === 'border' ? value : 'off';
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
			.setTitle(`Edit ${file instanceof TFolder ? 'folder' : 'file'} colors…`)
			.setIcon('palette')
			.onClick(() => new AppearanceModal(this, file.path).open()));

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
		this.appearancePreview.clearSubtree(oldPath);
		let changed = false;
		const remapped: Record<string, AppearanceRule> = {};
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
	}

	private async handleDelete(file: TAbstractFile): Promise<void> {
		this.appearancePreview.clearSubtree(file.path);
		const oldAppearanceCount = Object.keys(this.settings.appearanceRules).length;
		this.settings.appearanceRules = Object.fromEntries(
			Object.entries(this.settings.appearanceRules).filter(([path]) => !isSameOrDescendant(path, file.path)),
		);
		const oldHiddenCount = this.settings.hiddenPaths.length;
		this.settings.hiddenPaths = this.settings.hiddenPaths.filter((path) => !isSameOrDescendant(path, file.path));
		if (this.focusPath && isSameOrDescendant(this.focusPath, file.path)) {
			this.exitFocus(false);
			new Notice('Folder focus cleared because the focused folder was deleted.');
		}
		if (oldAppearanceCount !== Object.keys(this.settings.appearanceRules).length || oldHiddenCount !== this.settings.hiddenPaths.length) {
			await this.persist();
		} else {
			this.explorer.reconcileSoon();
		}
	}

	private async persist(): Promise<void> {
		await this.saveData(this.settings);
		this.explorer.reconcileSoon();
		this.tabs.reconcileSoon();
	}
}
