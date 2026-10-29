import { describe, expect, it, vi } from 'vitest';

import FolderToolkitPlugin from '../src/main';
import { AppearancePreviewStore } from '../src/appearance-preview';
import { resolveAppearance } from '../src/appearance-resolver';
import { paletteTemplate } from '../src/colors';
import { mergeNestedLayers, NestedVaultStore, ownerRoot, renameRules, type VaultFiles } from '../src/nested-vaults';
import { normalizeSettings } from '../src/settings';
import { DEFAULT_SETTINGS, type FolderToolkitSettings } from '../src/types';

function settings(overrides: Partial<FolderToolkitSettings> = {}): FolderToolkitSettings {
	return { ...structuredClone(DEFAULT_SETTINGS), conditionalFormats: [], ...overrides };
}

/** An in-memory vault. Folders exist when a file below them exists or when they are listed. */
class MemoryFiles implements VaultFiles {
	files = new Map<string, { data: string; mtime: number }>();
	private clock = 1;
	constructor(private readonly folders: string[] = []) {}
	exists(path: string): Promise<boolean> {
		return Promise.resolve(this.files.has(path) || this.folders.includes(path)
			|| [...this.files.keys(), ...this.folders].some((candidate) => candidate.startsWith(`${path}/`)));
	}
	read(path: string): Promise<string> {
		const file = this.files.get(path);
		return file ? Promise.resolve(file.data) : Promise.reject(new Error(`missing ${path}`));
	}
	write(path: string, data: string): Promise<void> {
		this.files.set(path, { data, mtime: this.clock += 1 });
		return Promise.resolve();
	}
	stat(path: string): Promise<{ mtime: number } | null> {
		const file = this.files.get(path);
		return Promise.resolve(file ? { mtime: file.mtime } : null);
	}
	json(path: string): Record<string, unknown> {
		return JSON.parse(this.files.get(path)?.data ?? 'null') as Record<string, unknown>;
	}
}

const DATA = 'Vaults/Inner/_config/plugins/folder-toolkit/data.json';

async function settle(): Promise<void> {
	for (let index = 0; index < 10; index += 1) await Promise.resolve();
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('mergeNestedLayers', () => {
	const inner = settings({
		paletteTemplateId: 'ocean-depth',
		appearanceRules: { Research: { background: { choice: { kind: 'preset', slot: 2 }, cascade: true } } },
		conditionalFormats: [{ id: 'archive', target: 'folder', match: 'equals', pattern: 'Archive', fontEnabled: true, color: { kind: 'preset', slot: 0 } }],
	});

	it('moves nested rules under the vault folder and resolves them with that vault\'s palette', () => {
		const merged = mergeNestedLayers(settings(), [{ root: 'Vaults/Inner', settings: inner }]);
		expect(Object.keys(merged.appearanceRules)).toEqual(['Vaults/Inner/Research']);
		const appearance = resolveAppearance('Vaults/Inner/Research/note.md', { settings: merged, isFolder: false });
		expect(appearance.background?.hex).toBe(paletteTemplate('ocean-depth').colors[2]);
	});

	it('applies nested name rules only inside the nested vault', () => {
		const merged = mergeNestedLayers(settings(), [{ root: 'Vaults/Inner', settings: inner }]);
		expect(resolveAppearance('Vaults/Inner/Archive', { settings: merged, isFolder: true }).text).not.toBeNull();
		expect(resolveAppearance('Other/Archive', { settings: merged, isFolder: true }).text).toBeNull();
	});

	it('lets a deeper vault win over an outer one and this vault\'s exact rule win over both', () => {
		const outer = settings({ appearanceRules: { 'Inner/Research': { background: { choice: { kind: 'custom', hex: '#111111' }, cascade: false } } } });
		const deeper = settings({ appearanceRules: { Research: { background: { choice: { kind: 'custom', hex: '#222222' }, cascade: false } } } });
		const layers = [{ root: 'Vaults/Inner', settings: deeper }, { root: 'Vaults', settings: outer }];
		expect(mergeNestedLayers(settings(), layers).appearanceRules['Vaults/Inner/Research']?.background?.choice).toEqual({ kind: 'custom', hex: '#222222' });
		const own = settings({ appearanceRules: { 'Vaults/Inner/Research': { background: { choice: { kind: 'custom', hex: '#333333' }, cascade: false } } } });
		expect(mergeNestedLayers(own, layers).appearanceRules['Vaults/Inner/Research']?.background?.choice).toEqual({ kind: 'custom', hex: '#333333' });
	});

	it('never stores the runtime palette tag in normalized settings', () => {
		const tagged = { appearanceRules: { A: { background: { choice: { kind: 'preset', slot: 1, palette: 'ember' }, cascade: false } } } };
		expect(normalizeSettings(tagged).appearanceRules.A?.background?.choice).toEqual({ kind: 'preset', slot: 1 });
	});
});

describe('path helpers', () => {
	it('picks the deepest vault and keeps a vault root with the vault around it', () => {
		expect(ownerRoot('A/B/C/note.md', ['A', 'A/B'])).toBe('A/B');
		expect(ownerRoot('A/B', ['A/B'])).toBeNull();
	});

	it('renames a rule and its descendants', () => {
		const rule = { text: { bold: true, strikethrough: false, cascade: false } };
		expect(renameRules({ Old: rule, 'Old/Sub': rule, Other: rule }, 'Old', 'New')).toEqual({ New: rule, 'New/Sub': rule, Other: rule });
		expect(renameRules({ Other: rule }, 'Old', 'New')).toBeNull();
	});
});

describe('NestedVaultStore', () => {
	function store(files: MemoryFiles, onChange = vi.fn()) {
		return { store: new NestedVaultStore(files, '_config', 'folder-toolkit', onChange), onChange };
	}

	it('finds a vault from the folders that the explorer shows and loads its rules', async () => {
		const files = new MemoryFiles();
		await files.write(DATA, JSON.stringify({ paletteTemplateId: 'ember', appearanceRules: { Notes: { text: { bold: true, strikethrough: false, cascade: false } } } }));
		const { store: nested, onChange } = store(files);
		nested.probe(['Vaults', 'Vaults/Inner']);
		await settle();
		expect(onChange).toHaveBeenCalled();
		expect(Object.keys(nested.effective(settings()).appearanceRules)).toEqual(['Vaults/Inner/Notes']);
		expect(nested.effective(settings({ nestedVaults: false })).appearanceRules).toEqual({});
	});

	it('reports a vault without settings so the explorer can mark it', async () => {
		const files = new MemoryFiles(['Vaults/Bare/_config']);
		const { store: nested, onChange } = store(files);
		nested.probe(['Vaults', 'Vaults/Bare']);
		await settle();
		expect(nested.isKnownVaultRoot('Vaults/Bare')).toBe(true);
		expect(nested.isKnownVaultRoot('Vaults')).toBe(false);
		expect(onChange).toHaveBeenCalledOnce();
	});

	it('returns the owning vault, or this vault when the nested vault has no Folder Toolkit', async () => {
		const files = new MemoryFiles(['Vaults/Inner/_config/plugins/folder-toolkit', 'Vaults/Bare/_config']);
		const { store: nested } = store(files);
		expect(await nested.ownerOf('Vaults/Inner/Research/Sub')).toEqual({ root: 'Vaults/Inner', relativePath: 'Research/Sub' });
		expect(await nested.ownerOf('Vaults/Bare/Research')).toEqual({ root: null, relativePath: 'Vaults/Bare/Research', skippedVault: 'Vaults/Bare' });
		expect(await nested.ownerOf('Vaults/Inner')).toEqual({ root: null, relativePath: 'Vaults/Inner' });
	});

	it('writes one rule into the file on disk and keeps every other field', async () => {
		const files = new MemoryFiles();
		await files.write(DATA, JSON.stringify({ schemaVersion: 6, future: 'kept', hiddenPaths: ['X'], appearanceRules: { Keep: { text: { bold: true, strikethrough: false, cascade: false } } } }));
		const { store: nested } = store(files);
		// Another window changes the file after it was loaded. The write must keep that change.
		await files.write(DATA, JSON.stringify({ ...files.json(DATA), appearanceRules: { Keep: { text: { bold: true, strikethrough: false, cascade: false } }, Added: { text: { bold: false, strikethrough: true, cascade: false } } } }));
		await nested.writeRule('Vaults/Inner', 'Research', { background: { choice: { kind: 'preset', slot: 3 }, cascade: false } });
		const saved = files.json(DATA);
		expect(saved.future).toBe('kept');
		expect(saved.hiddenPaths).toEqual(['X']);
		expect(Object.keys(saved.appearanceRules as object).sort()).toEqual(['Added', 'Keep', 'Research']);
		await nested.writeRule('Vaults/Inner', 'Research', null);
		expect(Object.keys(files.json(DATA).appearanceRules as object).sort()).toEqual(['Added', 'Keep']);
	});

	it('creates a settings file when the nested vault has none', async () => {
		const files = new MemoryFiles(['Vaults/Inner/_config/plugins/folder-toolkit']);
		const { store: nested } = store(files);
		await nested.writeRule('Vaults/Inner', 'Research', { text: { bold: true, strikethrough: false, cascade: false } });
		expect(normalizeSettings(files.json(DATA)).appearanceRules.Research?.text?.bold).toBe(true);
	});

	it('does not overwrite a settings file that it cannot read', async () => {
		const files = new MemoryFiles();
		await files.write(DATA, '{ broken');
		const { store: nested } = store(files);
		await expect(nested.writeRule('Vaults/Inner', 'Research', { text: { bold: true, strikethrough: false, cascade: false } })).rejects.toThrow();
		expect(files.files.get(DATA)?.data).toBe('{ broken');
	});

	it('reloads a nested vault when its file changes', async () => {
		const files = new MemoryFiles();
		await files.write(DATA, JSON.stringify({ appearanceRules: {} }));
		const { store: nested } = store(files);
		nested.probe(['Vaults/Inner']);
		await settle();
		await files.write(DATA, JSON.stringify({ appearanceRules: { New: { text: { bold: true, strikethrough: false, cascade: false } } } }));
		await nested.refresh();
		expect(Object.keys(nested.effective(settings()).appearanceRules)).toEqual(['Vaults/Inner/New']);
	});
});

describe('rename inside a nested vault', () => {
	it('moves the rule even when the nested vault already removed it from its file', async () => {
		vi.useFakeTimers();
		try {
			const files = new MemoryFiles(['Vaults/Inner/_config/plugins/folder-toolkit']);
			const rule = { background: { choice: { kind: 'preset' as const, slot: 1 }, cascade: true } };
			await files.write(DATA, JSON.stringify({ appearanceRules: { Old: rule, 'Old/Sub': rule } }));
			const nested = new NestedVaultStore(files, '_config', 'folder-toolkit', () => undefined);
			nested.probe(['Vaults/Inner']);
			await vi.runAllTimersAsync();

			// The nested vault's own window saw the rename as a delete and saved its file first.
			await files.write(DATA, JSON.stringify({ appearanceRules: {} }));

			const plugin = Object.create(FolderToolkitPlugin.prototype) as FolderToolkitPlugin;
			Object.assign(plugin, {
				settings: settings(),
				nested,
				appearancePreview: new AppearancePreviewStore(),
				explorer: { reconcileSoon: vi.fn() },
				tabs: { reconcileSoon: vi.fn() },
			});
			const rename = plugin as unknown as { handleRename(file: { path: string }, oldPath: string): Promise<void> };
			await rename.handleRename({ path: 'Vaults/Inner/New' }, 'Vaults/Inner/Old');
			expect(Object.keys(files.json(DATA).appearanceRules as object).sort()).toEqual(['New', 'New/Sub']);

			// The nested window saves its stale copy again; the second check restores the moved rules.
			await files.write(DATA, JSON.stringify({ appearanceRules: {} }));
			await vi.advanceTimersByTimeAsync(2500);
			expect(Object.keys(files.json(DATA).appearanceRules as object).sort()).toEqual(['New', 'New/Sub']);
		} finally {
			vi.useRealTimers();
		}
	});
});
