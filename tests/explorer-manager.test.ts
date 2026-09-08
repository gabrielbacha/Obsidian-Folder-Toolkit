import type { App, WorkspaceLeaf } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExplorerManager } from '../src/explorer-manager';
import { AppearancePreviewStore } from '../src/appearance-preview';
import type { FolderToolkitSettings } from '../src/types';

function folder(path: string, children: HTMLElement[] = []): HTMLElement {
	const row = document.createElement('div');
	row.className = 'nav-folder';
	const title = document.createElement('div');
	title.className = 'nav-folder-title';
	title.dataset.path = path;
	const childContainer = document.createElement('div');
	childContainer.className = 'nav-folder-children';
	childContainer.append(...children);
	row.append(title, childContainer);
	return row;
}

function file(path: string): HTMLElement {
	const row = document.createElement('div');
	row.className = 'nav-file';
	const title = document.createElement('div');
	title.className = 'nav-file-title';
	title.dataset.path = path;
	row.append(title);
	return row;
}

function mockApp(containerEl: HTMLElement): App {
	return {
		workspace: {
			getLeavesOfType: () => [{ view: { containerEl } } as unknown as WorkspaceLeaf],
		},
	} as unknown as App;
}

function watchDomWrites() {
	return {
		addClass: vi.spyOn(DOMTokenList.prototype, 'add'),
		removeClass: vi.spyOn(DOMTokenList.prototype, 'remove'),
		setStyle: vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty'),
		removeStyle: vi.spyOn(CSSStyleDeclaration.prototype, 'removeProperty'),
	};
}

function restoreDomWriteSpies(spies: ReturnType<typeof watchDomWrites>): void {
	for (const spy of Object.values(spies)) spy.mockRestore();
}

describe('ExplorerManager', () => {
	let root: HTMLElement;
	let settings: FolderToolkitSettings;

	beforeEach(() => {
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
		vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
		HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
		HTMLElement.prototype.removeClass = function (...classes: string[]) { this.classList.remove(...classes); };
		HTMLElement.prototype.hasClass = function (className: string) { return this.classList.contains(className); };
		HTMLElement.prototype.toggleClass = function (className: string, value: boolean) { this.classList.toggle(className, value); };
		root = document.createElement('div');
		const container = document.createElement('div');
		container.className = 'nav-files-container';
		container.append(folder('A', [folder('A/B', [file('A/B/note.md')]), folder('A/C')]), folder('Other'));
		root.append(container);
		document.body.append(root);
		settings = {
			schemaVersion: 1,
			paletteTemplateId: 'default',
			tabStyle: 'off',
			appearanceRules: {
				A: {
					text: { choice: { kind: 'preset', slot: 0 }, cascade: true },
					border: { style: 'box', color: { kind: 'preset', slot: 1 } },
				},
			},
			conditionalFormats: [],
			hiddenPaths: ['A/B/note.md'],
			showHiddenItems: false,
		};
	});

	afterEach(() => {
		root.remove();
		vi.unstubAllGlobals();
	});

	it('applies appearance, permanent hiding, and focused-root classes', () => {
		const manager = new ExplorerManager(mockApp(root), () => settings, () => 'A/B');
		manager.syncLeaves();
		manager.reconcile();
		const rowFor = (path: string) => root.querySelector<HTMLElement>(`[data-path="${path}"]`)!.parentElement!;
		expect(rowFor('A').hasClass('ft-focus-ancestor')).toBe(true);
		expect(rowFor('A').hasClass('ft-border-box')).toBe(false);
		expect(rowFor('A/B').hasClass('ft-focus-root')).toBe(true);
		expect(rowFor('Other').hasClass('ft-focus-hidden')).toBe(true);
		expect(rowFor('A/B/note.md').hasClass('ft-permanent-hidden')).toBe(true);
		expect(rowFor('A').hasClass('ft-direct-color-rule')).toBe(true);
		expect(rowFor('A/B').hasClass('ft-direct-color-rule')).toBe(false);
		expect(rowFor('A/B/note.md').style.getPropertyValue('--ft-text-light')).not.toBe('');
		manager.stop();
		expect(rowFor('A/B').hasClass('ft-focus-root')).toBe(false);
	});

	it('reconciles rows inserted after startup', async () => {
		const manager = new ExplorerManager(mockApp(root), () => settings, () => null);
		manager.start();
		const container = root.querySelector('.nav-files-container')!;
		container.append(file('A/new.md'));
		await new Promise((resolve) => window.setTimeout(resolve, 10));
		const row = root.querySelector<HTMLElement>('[data-path="A/new.md"]')!.parentElement!;
		expect(row.hasClass('ft-has-text')).toBe(true);
		manager.stop();
	});

	it('applies transient cascaded drafts and restores saved appearance when cleared', () => {
		const previews = new AppearancePreviewStore();
		const manager = new ExplorerManager(mockApp(root), () => previews.apply(settings), () => null);
		manager.syncLeaves();
		previews.set('A/B', {
			background: { choice: { kind: 'preset', slot: 2 }, cascade: true },
			border: { style: 'rail', color: { kind: 'preset', slot: 3 } },
		});
		manager.reconcile();
		const folderRow = root.querySelector<HTMLElement>('[data-path="A/B"]')!.parentElement!;
		const noteRow = root.querySelector<HTMLElement>('[data-path="A/B/note.md"]')!.parentElement!;
		expect(folderRow.hasClass('ft-border-rail')).toBe(true);
		expect(folderRow.hasClass('ft-direct-color-rule')).toBe(true);
		expect(noteRow.hasClass('ft-direct-color-rule')).toBe(false);
		expect(noteRow.hasClass('ft-has-background')).toBe(true);
		previews.clear('A/B');
		manager.reconcile();
		expect(folderRow.hasClass('ft-border-rail')).toBe(false);
		expect(folderRow.hasClass('ft-direct-color-rule')).toBe(false);
		expect(noteRow.hasClass('ft-has-background')).toBe(false);
		manager.stop();
	});

	it('performs no class or style writes when reconciliation state is unchanged', () => {
		const manager = new ExplorerManager(mockApp(root), () => settings, () => null);
		manager.syncLeaves();
		manager.reconcile();
		const writes = watchDomWrites();
		manager.reconcile();
		expect(writes.addClass).not.toHaveBeenCalled();
		expect(writes.removeClass).not.toHaveBeenCalled();
		expect(writes.setStyle).not.toHaveBeenCalled();
		expect(writes.removeStyle).not.toHaveBeenCalled();
		restoreDomWriteSpies(writes);
		manager.stop();
	});

	it('writes only the changed explorer effect and removes it when cleared', () => {
		const manager = new ExplorerManager(mockApp(root), () => settings, () => null);
		manager.syncLeaves();
		manager.reconcile();
		settings.appearanceRules.Other = {
			background: { choice: { kind: 'preset', slot: 2 }, cascade: true },
		};
		const addWrites = watchDomWrites();
		manager.reconcile();
		expect(addWrites.addClass).toHaveBeenCalledTimes(4);
		expect(addWrites.addClass).toHaveBeenCalledWith('ft-direct-color-rule');
		expect(addWrites.addClass).toHaveBeenCalledWith('ft-has-background');
		expect(addWrites.addClass).toHaveBeenCalledWith('ft-background-direct');
		expect(addWrites.addClass).toHaveBeenCalledWith('ft-background-cascade');
		expect(addWrites.setStyle).toHaveBeenCalledTimes(1);
		expect(addWrites.setStyle).toHaveBeenCalledWith('--ft-background', '#8E44AD');
		expect(addWrites.removeClass).not.toHaveBeenCalled();
		expect(addWrites.removeStyle).not.toHaveBeenCalled();
		restoreDomWriteSpies(addWrites);

		delete settings.appearanceRules.Other;
		const removeWrites = watchDomWrites();
		manager.reconcile();
		expect(removeWrites.removeClass).toHaveBeenCalledTimes(4);
		expect(removeWrites.removeClass).toHaveBeenCalledWith('ft-direct-color-rule');
		expect(removeWrites.removeClass).toHaveBeenCalledWith('ft-has-background');
		expect(removeWrites.removeClass).toHaveBeenCalledWith('ft-background-direct');
		expect(removeWrites.removeClass).toHaveBeenCalledWith('ft-background-cascade');
		expect(removeWrites.removeStyle).toHaveBeenCalledTimes(1);
		expect(removeWrites.removeStyle).toHaveBeenCalledWith('--ft-background');
		expect(removeWrites.addClass).not.toHaveBeenCalled();
		expect(removeWrites.setStyle).not.toHaveBeenCalled();
		restoreDomWriteSpies(removeWrites);
		manager.stop();
	});

	it('applies cascaded backgrounds per row and cycles direct-subfolder borders in visible order', () => {
		settings.appearanceRules.A = {
			background: { choice: { kind: 'preset', slot: 2 }, cascade: true },
			descendants: { enabled: true, style: 'box', thickness: 'thin', shading: true },
		};
		const manager = new ExplorerManager(mockApp(root), () => settings, () => null);
		manager.syncLeaves();
		manager.reconcile();
		const rowFor = (path: string) => root.querySelector<HTMLElement>(`[data-path="${path}"]`)!.parentElement!;
		for (const path of ['A', 'A/B', 'A/B/note.md', 'A/C']) {
			expect(rowFor(path).hasClass('ft-has-background')).toBe(true);
		}
		expect(rowFor('A').hasClass('ft-background-direct')).toBe(true);
		expect(rowFor('A').hasClass('ft-background-cascade')).toBe(true);
		for (const path of ['A/B', 'A/B/note.md', 'A/C']) {
			expect(rowFor(path).hasClass('ft-background-direct')).toBe(false);
			expect(rowFor(path).hasClass('ft-background-cascade')).toBe(false);
		}
		expect(rowFor('A/B').style.getPropertyValue('--ft-border')).toBe('#16A085');
		expect(rowFor('A/C').style.getPropertyValue('--ft-border')).toBe('#3498DB');
		expect(rowFor('A/B').hasClass('ft-border-shaded')).toBe(true);
		manager.stop();
	});
});
