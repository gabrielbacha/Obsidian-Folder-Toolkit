import { describe, expect, it, vi } from 'vitest';
import FolderToolkitPlugin from '../src/main';
import { AppearancePreviewStore } from '../src/appearance-preview';
import {
	collectAppearance,
	findMissingRoots,
	parseAppearance,
	planPaste,
	reattachRules,
	removeRulesUnder,
	serializeAppearance,
} from '../src/rule-transfer';
import type { AppearanceRule, FolderToolkitSettings } from '../src/types';

function installDomHelpers(): void {
	type Options = string | { text?: string; cls?: string; attr?: Record<string, string> };
	HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(tag: K, options?: Options) {
		const element = document.createElement(tag);
		if (typeof options === 'string') element.className = options;
		else if (options) {
			if (options.text !== undefined) element.textContent = options.text;
			if (options.cls) element.className = options.cls;
			for (const [name, value] of Object.entries(options.attr ?? {})) element.setAttribute(name, value);
		}
		this.append(element);
		return element;
	};
	HTMLElement.prototype.createDiv = function (options?: Options) { return this.createEl('div', options); };
	HTMLElement.prototype.createSpan = function (options?: Options) { return this.createEl('span', options); };
	HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
	HTMLElement.prototype.empty = function () { this.replaceChildren(); };
}

const blue: AppearanceRule = { background: { choice: { kind: 'preset', slot: 1 }, cascade: true } };
const red: AppearanceRule = { background: { choice: { kind: 'preset', slot: 7 }, cascade: false } };
const bold: AppearanceRule = { text: { bold: true, strikethrough: false, cascade: false } };

describe('missing rules', () => {
	it('groups missing rules under the topmost missing path', () => {
		const rules = { Old: blue, 'Old/Sub': red, 'Old/Sub/note.md': bold, Kept: blue, 'Kept/gone.md': red };
		const existing = new Set(['Kept']);
		expect(findMissingRoots(rules, (path) => existing.has(path))).toEqual([
			{ path: 'Kept/gone.md', count: 1 },
			{ path: 'Old', count: 3 },
		]);
	});

	it('moves a missing folder and its descendants, keeping rules that the new place already has', () => {
		const rules = { Old: blue, 'Old/Sub': red, 'New/Sub': bold, Other: red };
		const result = reattachRules(rules, 'Old', 'New');
		expect(result.rules).toEqual({ New: blue, 'New/Sub': bold, Other: red });
		expect(result.moved).toBe(1);
		expect(result.skipped).toBe(1);
	});

	it('does not move a sibling whose name starts with the same text', () => {
		const result = reattachRules({ Old: blue, 'Old two': red }, 'Old', 'New');
		expect(result.rules).toEqual({ New: blue, 'Old two': red });
	});

	it('removes a missing folder and its descendants only', () => {
		expect(removeRulesUnder({ Old: blue, 'Old/a.md': red, 'Old two': bold }, 'Old')).toEqual({ 'Old two': bold });
	});
});

describe('copy and paste', () => {
	it('copies an item and its descendants with relative paths', () => {
		const copied = collectAppearance({ A: blue, 'A/B': red, 'A/B/n.md': bold, AB: red }, 'A');
		expect(copied).toEqual({ '.': blue, B: red, 'B/n.md': bold });
	});

	it('round-trips through the clipboard text and drops runtime palette tags', () => {
		const tagged: AppearanceRule = { background: { choice: { kind: 'preset', slot: 1, palette: 'ember' }, cascade: true } };
		const parsed = parseAppearance(serializeAppearance({ '.': tagged, B: red }), 8);
		expect(parsed).toEqual({ '.': blue, B: red });
	});

	it('ignores other clipboard text and unsafe paths', () => {
		expect(parseAppearance('hello', 8)).toBeNull();
		expect(parseAppearance(JSON.stringify({ type: 'other', version: 1, rules: { '.': blue } }), 8)).toBeNull();
		const text = JSON.stringify({ type: 'folder-toolkit/appearance', version: 1, rules: { '../x': blue, '/abs': blue, 'a//b': blue, ok: red } });
		expect(parseAppearance(text, 8)).toEqual({ ok: red });
	});

	it('pastes onto the target and skips descendants that do not exist there', () => {
		const existing = new Set(['T', 'T/B']);
		const plan = planPaste({ '.': blue, B: red, C: bold }, 'T', (path) => existing.has(path));
		expect(plan).toEqual({ writes: { T: blue, 'T/B': red }, skipped: 1 });
	});
});

function plugin(rules: Record<string, AppearanceRule>, existing: string[]) {
	const settings: FolderToolkitSettings = {
		schemaVersion: 6, paletteTemplateId: 'default', tabStyle: 'off', appearanceRules: rules,
		conditionalFormats: [], hiddenPaths: [], showHiddenItems: false, nestedVaults: false, vaultMarker: 'off',
	};
	const files = new Set(existing);
	const persist = vi.fn().mockResolvedValue(undefined);
	const instance = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
	Object.assign(instance, {
		settings,
		persist,
		appearancePreview: new AppearancePreviewStore(),
		nested: { effective: (own: FolderToolkitSettings) => own, forget: vi.fn() },
		explorer: { reconcileSoon: vi.fn() },
		tabs: { reconcileSoon: vi.fn() },
		app: { vault: { getAbstractFileByPath: (path: string) => files.has(path) ? { path } : null } },
	});
	return { instance, settings, persist };
}

describe('plugin integration', () => {
	it('keeps appearance rules when an item is deleted, so that they can be reattached', async () => {
		const { instance, settings, persist } = plugin({ Old: blue, 'Old/a.md': red }, []);
		settings.hiddenPaths = ['Old'];
		await (instance as unknown as { handleDelete(file: { path: string }): Promise<void> }).handleDelete({ path: 'Old' });
		expect(settings.appearanceRules).toEqual({ Old: blue, 'Old/a.md': red });
		expect(settings.hiddenPaths).toEqual([]);
		expect(persist).toHaveBeenCalledOnce();
		expect(instance.missingAppearanceRoots()).toEqual([{ path: 'Old', count: 2 }]);
	});

	it('copies and pastes through the clipboard into this vault', async () => {
		let clipboard = '';
		vi.stubGlobal('navigator', { clipboard: {
			writeText: (text: string) => { clipboard = text; return Promise.resolve(); },
			readText: () => Promise.resolve(clipboard),
		} });
		const { instance, settings, persist } = plugin({ A: blue, 'A/B': red, 'T/B': bold }, ['A', 'A/B', 'T', 'T/B']);
		await instance.copyAppearance('A', bold);
		const copied = await instance.readCopiedAppearance();
		expect(copied).toEqual({ '.': bold, B: red });
		const result = await instance.pasteDescendantAppearance('T', copied ?? {});
		expect(result).toEqual({ saved: 1, skipped: 0 });
		expect(settings.appearanceRules['T/B']).toEqual(red);
		expect(settings.appearanceRules.T).toBeUndefined();
		expect(persist).toHaveBeenCalledOnce();
		vi.unstubAllGlobals();
	});

	it('opens a dialog from the command and reattaches from it', async () => {
		installDomHelpers();
		const { instance, settings } = plugin({ Old: blue, 'Old/a.md': red }, ['New', 'New/a.md']);
		document.body.replaceChildren();
		const { ReattachModal } = await import('../src/ui/reattach-modal');
		const { MissingItemsModal } = await import('../src/ui/missing-items-modal');
		const pick = vi.spyOn(ReattachModal.prototype, 'open').mockImplementation(function (this: unknown) {
			(this as { onPick: (item: { path: string }) => void }).onPick({ path: 'New' });
		});
		const open = vi.spyOn(MissingItemsModal.prototype, 'open').mockImplementation(function (this: { onOpen(): void; contentEl: HTMLElement }) {
			document.body.append(this.contentEl);
			this.onOpen();
		});
		instance.relinkMissingItems();
		const cards = document.querySelectorAll('.ft-rule-card--missing');
		expect(cards).toHaveLength(1);
		expect(cards[0]?.textContent).toContain('2 rules');
		document.querySelector<HTMLButtonElement>('.ft-rule-card--missing .mod-cta')?.click();
		await vi.waitFor(() => expect(settings.appearanceRules).toEqual({ New: blue, 'New/a.md': red }));
		await vi.waitFor(() => expect(document.querySelectorAll('.ft-rule-card--missing')).toHaveLength(0));
		expect(document.body.textContent).toContain('No missing items');
		pick.mockRestore();
		open.mockRestore();
	});
});
