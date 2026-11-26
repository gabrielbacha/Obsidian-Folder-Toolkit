import { describe, expect, it, vi } from 'vitest';
import type { Menu } from 'obsidian';
import { TFolder } from 'obsidian';
import FolderToolkitPlugin from '../src/main';
import { AppearancePreviewStore } from '../src/appearance-preview';
import { normalizeSettings } from '../src/settings';
import { serializeAppearance } from '../src/rule-transfer';
import { addSubmenu, appearanceMenuEntries, type AppearanceMenuHost } from '../src/ui/appearance-menu';

interface FakeItem {
	title: string;
	icon?: string;
	checked?: boolean | null;
	disabled?: boolean;
	label?: boolean;
	click?: () => void;
	submenu?: FakeMenu;
}

class FakeMenu {
	readonly items: Array<FakeItem | 'separator'> = [];
	constructor(private readonly submenus = true) {}
	addSeparator(): this { this.items.push('separator'); return this; }
	addItem(callback: (item: unknown) => unknown): this {
		const record: FakeItem = { title: '' };
		const item: Record<string, unknown> = {
			setTitle: (title: string) => { record.title = title; return item; },
			setIcon: (icon: string) => { record.icon = icon; return item; },
			setChecked: (checked: boolean | null) => { record.checked = checked; return item; },
			setDisabled: (disabled: boolean) => { record.disabled = disabled; return item; },
			setIsLabel: (label: boolean) => { record.label = label; return item; },
			onClick: (click: () => void) => { record.click = click; return item; },
		};
		if (this.submenus) item.setSubmenu = () => { record.submenu = new FakeMenu(); return record.submenu; };
		callback(item);
		this.items.push(record);
		return this;
	}
	titles(): string[] { return this.items.map((item) => item === 'separator' ? '—' : item.title); }
	find(title: string): FakeItem { return this.items.find((item): item is FakeItem => item !== 'separator' && item.title === title)!; }
}

function host(overrides: Partial<AppearanceMenuHost> = {}): AppearanceMenuHost {
	return {
		savedPresets: () => [{ id: 'p1', name: 'Review', rule: { tabs: false } }],
		hasOwnRule: () => true,
		showsOnTabs: () => true,
		tabColorsOn: () => false,
		copyAppearance: vi.fn().mockResolvedValue(undefined),
		pasteAppearance: vi.fn().mockResolvedValue(undefined),
		promptSavePreset: vi.fn(),
		applyPreset: vi.fn().mockResolvedValue(undefined),
		resetAppearance: vi.fn().mockResolvedValue(undefined),
		setItemTabs: vi.fn().mockResolvedValue(undefined),
		toggleTabColors: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

describe('Appearance submenu', () => {
	it('groups the appearance actions under one item', () => {
		const applyPreset = vi.fn().mockResolvedValue(undefined);
		const setItemTabs = vi.fn().mockResolvedValue(undefined);
		const resetAppearance = vi.fn().mockResolvedValue(undefined);
		const actions = host({ applyPreset, setItemTabs, resetAppearance });
		const menu = new FakeMenu();
		addSubmenu(menu as unknown as Menu, 'Appearance', 'paintbrush', appearanceMenuEntries('Folder/note.md', actions));
		expect(menu.titles()).toEqual(['Appearance']);
		const submenu = menu.find('Appearance').submenu!;
		expect(submenu.titles()).toEqual(['Copy appearance', 'Paste appearance', 'Save as preset…', 'Apply preset', 'Reset to inherited', '—', 'Show on note tabs', 'Note tab colors']);
		expect(submenu.find('Show on note tabs').checked).toBe(true);
		expect(submenu.find('Note tab colors').checked).toBe(false);
		const presets = submenu.find('Apply preset').submenu!;
		expect(presets.titles()).toEqual(['Review']);
		presets.find('Review').click!();
		expect(applyPreset).toHaveBeenCalledWith('Folder/note.md', 'p1');
		submenu.find('Show on note tabs').click!();
		expect(setItemTabs).toHaveBeenCalledWith('Folder/note.md', false);
		submenu.find('Reset to inherited').click!();
		expect(resetAppearance).toHaveBeenCalledWith('Folder/note.md');
	});

	it('disables actions that need an own rule or a saved preset', () => {
		const menu = new FakeMenu();
		addSubmenu(menu as unknown as Menu, 'Appearance', 'paintbrush', appearanceMenuEntries('note.md', host({ hasOwnRule: () => false, savedPresets: () => [] })));
		const submenu = menu.find('Appearance').submenu!;
		expect(submenu.find('Save as preset…').disabled).toBe(true);
		expect(submenu.find('Reset to inherited').disabled).toBe(true);
		expect(submenu.find('Apply preset').submenu!.find('No saved presets').disabled).toBe(true);
	});

	it('adds the entries flat when menus have no submenus', () => {
		const copyAppearance = vi.fn().mockResolvedValue(undefined);
		const actions = host({ copyAppearance });
		const menu = new FakeMenu(false);
		addSubmenu(menu as unknown as Menu, 'Appearance', 'paintbrush', appearanceMenuEntries('note.md', actions));
		expect(menu.titles()).toEqual([
			'Appearance', 'Appearance: Copy appearance', 'Appearance: Paste appearance', 'Appearance: Save as preset…',
			'Appearance: Apply preset', 'Appearance: Apply preset: Review', 'Appearance: Reset to inherited',
			'Appearance: Show on note tabs', 'Appearance: Note tab colors',
		]);
		expect(menu.find('Appearance').label).toBe(true);
		menu.find('Appearance: Copy appearance').click!();
		expect(copyAppearance).toHaveBeenCalledWith('note.md');
	});
});

function plugin(paths: Record<string, 'file' | 'folder'>, rules = {}) {
	const instance = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
	const settings = normalizeSettings({ appearanceRules: rules, nestedVaults: false });
	const persist = vi.fn().mockResolvedValue(undefined);
	const writeRule = vi.fn().mockResolvedValue(undefined);
	Object.assign(instance, {
		settings,
		persist,
		appearancePreview: new AppearancePreviewStore(),
		nested: { effective: (value: unknown) => value, ownerOf: async (path: string) => ({ root: null, relativePath: path }), writeRule, mutate: vi.fn() },
		app: {
			vault: {
				getAbstractFileByPath: (path: string) => {
					const kind = paths[path];
					if (!kind) return null;
					return kind === 'folder' ? Object.assign(new TFolder(), { path }) : { path };
				},
			},
		},
	});
	return { instance, settings, persist, writeRule };
}

describe('appearance actions without the editor', () => {
	it('pastes the own rule and the rules of items inside a folder', async () => {
		const { instance, settings } = plugin({ Target: 'folder', 'Target/child.md': 'file' });
		const text = serializeAppearance({
			'.': { background: { choice: { kind: 'preset', slot: 2 }, cascade: true } },
			'child.md': { tabs: false },
			'missing.md': { tabs: false },
		});
		vi.stubGlobal('navigator', { clipboard: { readText: async () => text } });
		try {
			await instance.pasteAppearance('Target');
		} finally { vi.unstubAllGlobals(); }
		expect(settings.appearanceRules.Target).toEqual({ background: { choice: { kind: 'preset', slot: 2 }, cascade: true } });
		expect(settings.appearanceRules['Target/child.md']).toEqual({ tabs: false });
		expect(settings.appearanceRules['Target/missing.md']).toBeUndefined();
	});

	it('applies a preset to a file without folder-only parts', async () => {
		const { instance, settings } = plugin({ 'note.md': 'file' });
		settings.savedPresets = [{ id: 'p1', name: 'Review', rule: { text: { color: { kind: 'preset', slot: 1 }, bold: true, strikethrough: false, cascade: true }, descendants: { enabled: true, style: 'rail' } } }];
		await instance.applyPreset('note.md', 'p1');
		expect(settings.appearanceRules['note.md']).toEqual({ text: { color: { kind: 'preset', slot: 1 }, bold: true, strikethrough: false, cascade: false } });
	});

	it('resets an own rule and a nested-vault rule to inherited', async () => {
		const { instance, settings, writeRule } = plugin({ 'note.md': 'file', 'Vault/note.md': 'file' }, { 'note.md': { tabs: false } });
		await instance.resetAppearance('note.md');
		expect(settings.appearanceRules['note.md']).toBeUndefined();

		Object.assign(instance, {
			appearanceTarget: async () => ({ owner: { root: 'Vault', relativePath: 'note.md' }, paletteTemplateId: 'default', rule: { tabs: false } }),
		});
		await instance.resetAppearance('Vault/note.md');
		expect(writeRule).toHaveBeenCalledWith('Vault', 'note.md', {});
	});

	it('stores a tab choice only when it differs from the inherited one', async () => {
		const { instance, settings } = plugin({ Folder: 'folder', 'Folder/note.md': 'file' }, { Folder: { tabs: false } });
		await instance.setItemTabs('Folder/note.md', true);
		expect(settings.appearanceRules['Folder/note.md']).toEqual({ tabs: true });
		await instance.setItemTabs('Folder/note.md', false);
		expect(settings.appearanceRules['Folder/note.md']).toBeUndefined();
	});

	it('toggles tab colors and restores the last style', async () => {
		const { instance, settings } = plugin({});
		await instance.setTabStyle('border');
		await instance.toggleTabColors();
		expect(settings.tabStyle).toBe('off');
		await instance.toggleTabColors();
		expect(settings.tabStyle).toBe('border');
	});

	it('saves, renames, and deletes presets', async () => {
		const { instance, settings } = plugin({});
		const id = await instance.savePreset('  Review ', { tabs: false });
		expect(settings.savedPresets).toEqual([{ id, name: 'Review', rule: { tabs: false } }]);
		await expect(instance.savePreset('Empty', {})).rejects.toThrow(/empty/);
		await instance.renamePreset(id, 'Final');
		expect(settings.savedPresets[0]?.name).toBe('Final');
		await instance.deletePreset(id);
		expect(settings.savedPresets).toEqual([]);
	});

	it('duplicates a name rule right after the original', async () => {
		const { instance, settings } = plugin({});
		settings.conditionalFormats = [
			{ id: 'a', target: 'folder', match: 'equals', pattern: 'a', color: { kind: 'custom', hex: '#111111' } },
			{ id: 'b', target: 'file', match: 'contains', pattern: 'b', color: { kind: 'custom', hex: '#222222' }, bold: true },
		];
		const copy = await instance.duplicateConditionalFormat('a');
		expect(settings.conditionalFormats.map((rule) => rule.id)).toEqual(['a', copy, 'b']);
		const { id: _copyId, ...copied } = settings.conditionalFormats[1];
		const { id: _originalId, ...original } = settings.conditionalFormats[0];
		expect(copied).toEqual(original);
		expect(await instance.duplicateConditionalFormat('missing')).toBeNull();
	});
});
