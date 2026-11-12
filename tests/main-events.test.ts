import { describe, expect, it, vi } from 'vitest';

import FolderToolkitPlugin from '../src/main';
import { AppearancePreviewStore } from '../src/appearance-preview';
import { DEFAULT_SETTINGS, type FolderToolkitSettings } from '../src/types';
import { normalizeSettings } from '../src/settings';

describe('workspace refresh events', () => {
	it('reconciles tabs after a move even when no stored path changes', async () => {
		const explorerReconcile = vi.fn();
		const tabReconcile = vi.fn();
		const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
		const settings: FolderToolkitSettings = {
			schemaVersion: 1,
			paletteTemplateId: 'default',
			tabStyle: 'background',
			appearanceRules: {
				Blue: { background: { choice: { kind: 'preset', slot: 1 }, cascade: true } },
				Red: { background: { choice: { kind: 'preset', slot: 7 }, cascade: true } },
			},
			conditionalFormats: [],
			hiddenPaths: [],
			showHiddenItems: false,
			nestedVaults: false,
			vaultMarker: 'off',
		};
		Object.assign(plugin, {
			settings,
			appearancePreview: new AppearancePreviewStore(),
			explorer: { reconcileSoon: explorerReconcile },
			tabs: { reconcileSoon: tabReconcile },
		});
		const rename = plugin as unknown as {
			handleRename(file: { path: string }, oldPath: string): Promise<void>;
		};
		await rename.handleRename({ path: 'Red/note.md' }, 'Blue/note.md');
		expect(explorerReconcile).toHaveBeenCalledOnce();
		expect(tabReconcile).toHaveBeenCalledOnce();
	});

	describe("conditional rule ordering", () => {
		it("moves a rule without changing its id and persists once", async () => {
			const persist = vi.fn().mockResolvedValue(undefined);
			const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
			const conditionalFormats = [
				{ id: "a", target: "folder" as const, match: "equals" as const, pattern: "a", color: { kind: "custom" as const, hex: "#111111" } },
				{ id: "b", target: "folder" as const, match: "equals" as const, pattern: "b", color: { kind: "custom" as const, hex: "#222222" } },
			];
			Object.assign(plugin, { settings: { conditionalFormats }, persist });
			await plugin.moveConditionalFormat("b", -1);
			expect(conditionalFormats.map((rule) => rule.id)).toEqual(["b", "a"]);
			expect(persist).toHaveBeenCalledOnce();
		});

		it("does not persist unavailable moves", async () => {
			const persist = vi.fn().mockResolvedValue(undefined);
			const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
			Object.assign(plugin, { settings: { conditionalFormats: [] }, persist });
			await plugin.moveConditionalFormat("missing", 1);
			expect(persist).not.toHaveBeenCalled();
		});
	});

	describe("open conditional formatting command", () => {
		it("opens the plugin settings tab and reveals the name rules", () => {
			const calls: string[] = [];
			const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
			Object.assign(plugin, {
				app: { setting: { open: () => calls.push("open"), openTabById: (id: string) => calls.push(`tab:${id}`) } },
				manifest: { id: "folder-toolkit" },
				settingTab: { revealConditionalFormats: () => calls.push("reveal") },
			});
			plugin.openConditionalFormatting();
			expect(calls).toEqual(["open", "tab:folder-toolkit", "reveal"]);
		});

		it("does not throw when the settings modal is unavailable", () => {
			const reveal = vi.fn();
			const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
			Object.assign(plugin, { app: {}, manifest: { id: "folder-toolkit" }, settingTab: { revealConditionalFormats: reveal } });
			expect(() => plugin.openConditionalFormatting()).not.toThrow();
			expect(reveal).not.toHaveBeenCalled();
		});
	});

});


describe('external settings error ownership', () => {
	it('ignores a late failed load after a newer edit or unload', async () => {
		for (const closed of [false, true]) {
			let reject!: (error: Error) => void;
			let began!: () => void;
			const started = new Promise<void>(resolve => { began = resolve; });
			const data = new Promise<unknown>((_resolve, fail) => { reject = fail; });
			const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
			Object.assign(plugin, { settingsGeneration: 0, settingsReadOnlyError: null, loadData: () => { began(); return data; } });
			const pending = plugin.onExternalSettingsChange();
			await started;
			Object.assign(plugin, closed ? { unloaded: true } : { settingsGeneration: 1 });
			reject(new Error('synthetic stale read failure'));
			await pending;
			expect((plugin as unknown as { settingsReadOnlyError: unknown }).settingsReadOnlyError).toBeNull();
		}
	});
});


it('closes only registered appearance editors during plugin unload', () => {
	const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
	Object.assign(plugin, { appearancePreview: new AppearancePreviewStore() });
	const close = vi.fn(); plugin.registerAppearanceEditor({ close } as never);
	plugin.onunload(); expect(close).toHaveBeenCalledOnce();
});


it('does not open or report a late appearance load failure after unload', async () => {
	const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
	let reject!: (error: Error) => void;
	const pendingTarget = new Promise<never>((_resolve, fail) => { reject = fail; });
	Object.assign(plugin, { app: { vault: { getAbstractFileByPath: () => ({ path: 'Folder' }) } }, appearancePreview: new AppearancePreviewStore(), appearanceTarget: () => pendingTarget });
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		const opening = plugin.openAppearanceEditor('Folder'); plugin.onunload(); reject(new Error('synthetic delayed error')); await opening;
		expect(log).not.toHaveBeenCalled();
	} finally { log.mockRestore(); }
});


it('serializes local saves around an external reload and uses the actual manifest directory', async () => {
	const path = '_config/plugins/dev-folder/data.json';
	const data = new Map([[path, JSON.stringify(DEFAULT_SETTINGS)]]);
	let release!: () => void; let began!: () => void; let first = true;
	const started = new Promise<void>(resolve => { began = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
	const adapter = {
		exists: async (name: string) => data.has(name), read: async (name: string) => data.get(name)!,
		write: async (name: string, value: string) => { data.set(name, value); }, remove: async (name: string) => { data.delete(name); },
		process: async (name: string, edit: (old: string) => string) => {
			const next = edit(data.get(name)!); data.set(name, next);
			if (first) { first = false; began(); await barrier; }
			return next;
		},
	};
	const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
	Object.assign(plugin, { manifest: { id: 'folder-toolkit', dir: '_config/plugins/dev-folder' }, app: { vault: { configDir: '_config', adapter } }, loadData: async (): Promise<unknown> => JSON.parse(data.get(path)!) as unknown, settings: normalizeSettings(DEFAULT_SETTINGS), requestedSettings: normalizeSettings(DEFAULT_SETTINGS), explorer: { reconcileSoon() {} }, tabs: { reconcileSoon() {} }, nested: { invalidate() {} } });
	const a = plugin.setAppearance('A', { text: { bold: true, strikethrough: false, cascade: false } }); await started;
	const external = plugin.onExternalSettingsChange();
	const b = plugin.setAppearance('B', { text: { bold: false, strikethrough: true, cascade: false } }); release(); await Promise.all([a, external, b]);
	const saved = normalizeSettings(JSON.parse(data.get(path)!)); expect(Object.keys(saved.appearanceRules).sort()).toEqual(['A', 'B']);
	expect(Object.keys(plugin.settings.appearanceRules).sort()).toEqual(['A', 'B']);
	expect(data.has('_config/plugins/folder-toolkit/data.json')).toBe(false);
});
