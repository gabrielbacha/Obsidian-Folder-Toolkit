import type { Menu, MenuItem } from 'obsidian';
import type { SavedPreset } from '../types';

/** What the right-click Appearance submenu needs from the plugin. */
export interface AppearanceMenuHost {
	savedPresets(): SavedPreset[];
	/** True when the item has its own saved rule in this vault or in the nested vault that owns it. */
	hasOwnRule(path: string): boolean;
	/** Whether the item's tab shows its colors, after inheritance. */
	showsOnTabs(path: string): boolean;
	tabColorsOn(): boolean;
	copyAppearance(path: string): Promise<void>;
	pasteAppearance(path: string): Promise<void>;
	promptSavePreset(path: string): void;
	applyPreset(path: string, id: string): Promise<void>;
	resetAppearance(path: string): Promise<void>;
	setItemTabs(path: string, visible: boolean): Promise<void>;
	toggleTabColors(): Promise<void>;
}

export type MenuEntry =
	| { kind: 'separator' }
	| {
		kind: 'item';
		title: string;
		icon?: string;
		checked?: boolean;
		disabled?: boolean;
		onClick?: () => void;
		children?: MenuEntry[];
	};

/** Runs `task` and reports a failure in the console; the plugin methods show their own notices. */
function run(task: () => Promise<void>): () => void {
	return () => {
		void task().catch((error: unknown) => console.error('Folder Toolkit: the appearance action failed.', error));
	};
}

export function appearanceMenuEntries(path: string, host: AppearanceMenuHost): MenuEntry[] {
	const ownRule = host.hasOwnRule(path);
	const presets = host.savedPresets();
	const presetEntries: MenuEntry[] = presets.length > 0
		? presets.map((preset) => ({ kind: 'item', title: preset.name, icon: 'swatch-book', onClick: run(() => host.applyPreset(path, preset.id)) }))
		: [{ kind: 'item', title: 'No saved presets', disabled: true }];
	const showsOnTabs = host.showsOnTabs(path);
	return [
		{ kind: 'item', title: 'Copy appearance', icon: 'copy', onClick: run(() => host.copyAppearance(path)) },
		{ kind: 'item', title: 'Paste appearance', icon: 'clipboard-paste', onClick: run(() => host.pasteAppearance(path)) },
		{ kind: 'item', title: 'Save as preset…', icon: 'bookmark-plus', disabled: !ownRule, onClick: () => host.promptSavePreset(path) },
		{ kind: 'item', title: 'Apply preset', icon: 'swatch-book', children: presetEntries },
		{ kind: 'item', title: 'Reset to inherited', icon: 'rotate-ccw', disabled: !ownRule, onClick: run(() => host.resetAppearance(path)) },
		{ kind: 'separator' },
		{ kind: 'item', title: 'Show on note tabs', icon: 'panel-top', checked: showsOnTabs, onClick: run(() => host.setItemTabs(path, !showsOnTabs)) },
		{ kind: 'item', title: 'Note tab colors', icon: 'app-window', checked: host.tabColorsOn(), onClick: run(() => host.toggleTabColors()) },
	];
}

type SubmenuItem = MenuItem & { setSubmenu?: () => Menu };

function configure(item: MenuItem, entry: Extract<MenuEntry, { kind: 'item' }>, title = entry.title): void {
	item.setTitle(title);
	if (entry.icon) item.setIcon(entry.icon);
	if (entry.checked !== undefined) item.setChecked(entry.checked);
	if (entry.disabled) item.setDisabled(true);
	if (entry.onClick) item.onClick(entry.onClick);
}

/**
 * Adds `entries` under one item named `title`. Obsidian's menus support submenus through
 * `MenuItem.setSubmenu`, which the public type definitions do not list yet. Where it is
 * missing, the entries are added to `menu` directly with `title` as a prefix.
 */
export function addSubmenu(menu: Menu, title: string, icon: string, entries: MenuEntry[]): void {
	const created: { submenu: Menu | null } = { submenu: null };
	menu.addItem((item) => {
		item.setTitle(title).setIcon(icon);
		const withSubmenu = item as SubmenuItem;
		if (typeof withSubmenu.setSubmenu === 'function') created.submenu = withSubmenu.setSubmenu();
		else item.setIsLabel(true);
	});
	if (created.submenu) fill(created.submenu, entries, '');
	else fill(menu, entries, `${title}: `);
}

function fill(menu: Menu, entries: MenuEntry[], prefix: string): void {
	for (const entry of entries) {
		if (entry.kind === 'separator') {
			if (!prefix) menu.addSeparator();
			continue;
		}
		if (entry.children) {
			addSubmenu(menu, `${prefix}${entry.title}`, entry.icon ?? 'chevron-right', entry.children);
			continue;
		}
		menu.addItem((item) => configure(item, entry, `${prefix}${entry.title}`));
	}
}
