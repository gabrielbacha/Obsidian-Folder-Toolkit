import type { App, WorkspaceLeaf } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { TabManager, tabAccents } from '../src/tab-manager';
import type { FolderToolkitSettings } from '../src/types';

function settings(mode: 'off' | 'background' | 'border'): FolderToolkitSettings {
	return {
		schemaVersion: 1,
		paletteTemplateId: 'default',
		tabStyle: mode,
		appearanceRules: {
			A: { text: { choice: { kind: 'preset', slot: 0 }, cascade: true } },
			B: { background: { choice: { kind: 'preset', slot: 1 }, cascade: true } },
			C: {
				text: { choice: { kind: 'preset', slot: 2 }, cascade: true },
				background: { choice: { kind: 'preset', slot: 3 }, cascade: true },
			},
		},
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

describe('open note tabs', () => {
	it('resolves text and background as independent channels', () => {
		expect(tabAccents('A/note.md', settings('background'))).toEqual({ text: '#16A085', background: null });
		expect(tabAccents('B/note.md', settings('background'))).toEqual({ text: null, background: '#3498DB' });
		expect(tabAccents('C/note.md', settings('background'))).toEqual({ text: '#8E44AD', background: '#2C3E50' });
		expect(tabAccents('Other.md', settings('background'))).toEqual({ text: null, background: null });
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
		expect(firstHeader.style.getPropertyValue('--ft-tab-text')).toBe('#16A085');
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
});
