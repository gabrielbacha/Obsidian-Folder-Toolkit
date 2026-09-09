import type { App, WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TabManager, tabAccents } from '../src/tab-manager';
import type { FolderToolkitSettings } from '../src/types';

function settings(mode: 'off' | 'background' | 'border'): FolderToolkitSettings {
	return {
		schemaVersion: 1,
		paletteTemplateId: 'default',
		tabStyle: mode,
		appearanceRules: {
			A: { text: { color: { kind: 'preset', slot: 0 }, bold: false, strikethrough: false, cascade: true } },
			B: { background: { choice: { kind: 'preset', slot: 1 }, cascade: true } },
			C: {
				text: { color: { kind: 'preset', slot: 2 }, bold: false, strikethrough: false, cascade: true },
				background: { choice: { kind: 'preset', slot: 3 }, cascade: true },
			},
		},
		conditionalFormats: [],
		hiddenPaths: [],
		showHiddenItems: false,
	};
}

function createLeaf(containerEl: HTMLElement, path: string): WorkspaceLeaf {
	return {
		view: { containerEl },
		getViewState: () => ({ type: 'markdown', state: { file: path } }),
	} as unknown as WorkspaceLeaf;
}

function singleTab(path: string): { workspace: HTMLElement; header: HTMLElement; leaf: WorkspaceLeaf } {
	const workspace = document.createElement('div');
	const tabs = document.createElement('div');
	tabs.className = 'workspace-tabs';
	const header = document.createElement('div');
	header.className = 'workspace-tab-header';
	const leafElement = document.createElement('div');
	leafElement.className = 'workspace-leaf';
	const content = document.createElement('div');
	leafElement.append(content);
	tabs.append(header, leafElement);
	workspace.append(tabs);
	return { workspace, header, leaf: createLeaf(content, path) };
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

describe('open note tabs', () => {
	it('resolves text and background as independent channels', () => {
		expect(tabAccents('A/note.md', settings('background'))).toEqual({ text: '#12856E', textDark: '#16A085', textStrength: null, background: null, backgroundStrength: null });
		expect(tabAccents('B/note.md', settings('background'))).toEqual({ text: null, textDark: null, textStrength: null, background: '#3498DB', backgroundStrength: null });
		expect(tabAccents('C/note.md', settings('background'))).toEqual({ text: '#8E44AD', textDark: '#AA73C2', textStrength: null, background: '#2C3E50', backgroundStrength: null });
		expect(tabAccents('Other.md', settings('background'))).toEqual({ text: null, textDark: null, textStrength: null, background: null, backgroundStrength: null });
	});

	it('retains cascaded tab backgrounds inside shaded direct subfolders', () => {
		const current = settings('background');
		current.appearanceRules.B.descendants = { enabled: true, style: 'box', thickness: 'thin', shading: true };
		expect(tabAccents('B/Subfolder/note.md', current)).toEqual({ text: null, textDark: null, textStrength: null, background: '#3498DB', backgroundStrength: null });
	});

	it('maps leaves to their tab headers and cleans up', () => {
		const workspace = document.createElement('div');
		const tabs = document.createElement('div');
		tabs.className = 'workspace-tabs';
		const headerContainer = document.createElement('div');
		const firstHeader = document.createElement('div');
		firstHeader.className = 'workspace-tab-header';
		const secondHeader = document.createElement('div');
		secondHeader.className = 'workspace-tab-header';
		headerContainer.append(firstHeader, secondHeader);
		const firstLeafElement = document.createElement('div');
		firstLeafElement.className = 'workspace-leaf';
		const firstContent = document.createElement('div');
		firstLeafElement.append(firstContent);
		const secondLeafElement = document.createElement('div');
		secondLeafElement.className = 'workspace-leaf';
		const secondContent = document.createElement('div');
		secondLeafElement.append(secondContent);
		tabs.append(headerContainer, firstLeafElement, secondLeafElement);
		workspace.append(tabs);
		document.body.append(workspace);
		const leaves = [createLeaf(firstContent, 'A/note.md'), createLeaf(secondContent, 'B/note.md')];
		const app = {
			workspace: {
				containerEl: workspace,
				iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => unknown) => leaves.forEach(callback),
			},
		} as unknown as App;
		const manager = new TabManager(app, () => settings('border'));
		manager.reconcile();
		expect(firstHeader.classList.contains('ft-tab-has-text')).toBe(true);
		expect(firstHeader.classList.contains('ft-tab-border')).toBe(false);
		expect(firstHeader.style.getPropertyValue('--ft-tab-text')).toBe('#12856E');
		expect(firstHeader.style.getPropertyValue('--ft-tab-text-dark')).toBe('#16A085');
		expect(secondHeader.classList.contains('ft-tab-has-text')).toBe(false);
		expect(secondHeader.classList.contains('ft-tab-border')).toBe(true);
		expect(secondHeader.style.getPropertyValue('--ft-tab-border')).toBe('#3498DB');
		manager.stop();
		expect(firstHeader.classList.contains('ft-tab-has-text')).toBe(false);
		expect(firstHeader.style.getPropertyValue('--ft-tab-text')).toBe('');
		expect(secondHeader.classList.contains('ft-tab-border')).toBe(false);
		expect(secondHeader.style.getPropertyValue('--ft-tab-border')).toBe('');
		workspace.remove();
	});

	it('uses background only for background mode while still applying title text', () => {
		const workspace = document.createElement('div');
		const tabs = document.createElement('div');
		tabs.className = 'workspace-tabs';
		const header = document.createElement('div');
		header.className = 'workspace-tab-header';
		const leafElement = document.createElement('div');
		leafElement.className = 'workspace-leaf';
		const content = document.createElement('div');
		leafElement.append(content);
		tabs.append(header, leafElement);
		workspace.append(tabs);
		const leaf = createLeaf(content, 'C/note.md');
		const app = { workspace: { containerEl: workspace, iterateAllLeaves: (callback: (item: WorkspaceLeaf) => unknown) => callback(leaf) } } as unknown as App;
		const manager = new TabManager(app, () => settings('background'));
		manager.reconcile();
		expect(header.classList.contains('ft-tab-has-text')).toBe(true);
		expect(header.classList.contains('ft-tab-background')).toBe(true);
		expect(header.style.getPropertyValue('--ft-tab-text')).toBe('#8E44AD');
		expect(header.style.getPropertyValue('--ft-tab-background')).toBe('#2C3E50');
	});

	it('performs no class or style writes when tab state is unchanged', () => {
		const { workspace, leaf } = singleTab('C/note.md');
		const app = {
			workspace: {
				containerEl: workspace,
				iterateAllLeaves: (callback: (item: WorkspaceLeaf) => unknown) => callback(leaf),
			},
		} as unknown as App;
		const manager = new TabManager(app, () => settings('background'));
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

	it('switches only the background treatment while preserving tab text', () => {
		const { workspace, header, leaf } = singleTab('C/note.md');
		let currentSettings = settings('background');
		const app = {
			workspace: {
				containerEl: workspace,
				iterateAllLeaves: (callback: (item: WorkspaceLeaf) => unknown) => callback(leaf),
			},
		} as unknown as App;
		const manager = new TabManager(app, () => currentSettings);
		manager.reconcile();
		currentSettings = settings('border');
		const writes = watchDomWrites();
		manager.reconcile();
		expect(writes.addClass).toHaveBeenCalledTimes(1);
		expect(writes.addClass).toHaveBeenCalledWith('ft-tab-border');
		expect(writes.removeClass).toHaveBeenCalledTimes(1);
		expect(writes.removeClass).toHaveBeenCalledWith('ft-tab-background');
		expect(writes.setStyle).toHaveBeenCalledTimes(1);
		expect(writes.setStyle).toHaveBeenCalledWith('--ft-tab-border', '#2C3E50');
		expect(writes.removeStyle).toHaveBeenCalledTimes(1);
		expect(writes.removeStyle).toHaveBeenCalledWith('--ft-tab-background');
		expect(header.style.getPropertyValue('--ft-tab-text')).toBe('#8E44AD');
		restoreDomWriteSpies(writes);
		manager.stop();
	});

	it('cleans connected headers when styling is switched off', () => {
		const { workspace, header, leaf } = singleTab('C/note.md');
		let currentSettings = settings('background');
		const app = {
			workspace: {
				containerEl: workspace,
				iterateAllLeaves: (callback: (item: WorkspaceLeaf) => unknown) => callback(leaf),
			},
		} as unknown as App;
		const manager = new TabManager(app, () => currentSettings);
		manager.reconcile();
		currentSettings = settings('off');
		manager.reconcile();
		expect(header.classList.contains('ft-tab-has-text')).toBe(false);
		expect(header.classList.contains('ft-tab-background')).toBe(false);
		expect(header.style.getPropertyValue('--ft-tab-text')).toBe('');
		expect(header.style.getPropertyValue('--ft-tab-background')).toBe('');
	});

	it('styles newly reported tabs and clears headers no longer backed by a leaf', () => {
		const { workspace, header, leaf } = singleTab('C/note.md');
		let leaves: WorkspaceLeaf[] = [];
		const app = {
			workspace: {
				containerEl: workspace,
				iterateAllLeaves: (callback: (item: WorkspaceLeaf) => unknown) => leaves.forEach(callback),
			},
		} as unknown as App;
		const manager = new TabManager(app, () => settings('background'));
		manager.reconcile();
		expect(header.classList.contains('ft-tab-background')).toBe(false);
		leaves = [leaf];
		manager.reconcile();
		expect(header.classList.contains('ft-tab-background')).toBe(true);
		leaves = [];
		manager.reconcile();
		expect(header.classList.contains('ft-tab-background')).toBe(false);
		expect(header.style.getPropertyValue('--ft-tab-background')).toBe('');
	});
});
