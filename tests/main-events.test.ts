import { describe, expect, it, vi } from 'vitest';

import FolderToolkitPlugin from '../src/main';
import { AppearancePreviewStore } from '../src/appearance-preview';
import type { FolderToolkitSettings } from '../src/types';

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

});
