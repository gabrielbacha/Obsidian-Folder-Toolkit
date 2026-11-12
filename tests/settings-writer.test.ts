import { describe, expect, it, vi } from 'vitest';
import { publishSettings, type SettingsFiles } from '../src/settings-writer';
import { normalizeSettings } from '../src/settings';
import type { AppearanceRule, TextAppearanceRule, FolderToolkitSettings } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/types';

type FixtureRule = AppearanceRule & { futureText?: string; futureRule?: number; text?: TextAppearanceRule & { future?: string } };
type FixtureDocument = Omit<FolderToolkitSettings, 'appearanceRules'> & { future?: unknown; original?: string; appearanceRules: Record<string, FixtureRule> };
function parse(text: string): FixtureDocument { return JSON.parse(text) as FixtureDocument; }

function fixture() {
	const data = new Map<string, string>([['data.json', JSON.stringify({ ...DEFAULT_SETTINGS, conditionalFormats: [], future: { kept: true } })]]);
	let queue: Promise<unknown> = Promise.resolve();
	const files: SettingsFiles = {
		exists: async (path) => data.has(path), read: async (path) => data.get(path)!,
		write: async (path, value) => { data.set(path, value); },
		copy: async (source, target) => { if (data.has(target)) throw new Error('EEXIST'); data.set(target, data.get(source)!); },
		process: (path, edit) => {
			const task = queue.then(() => { const value = edit(data.get(path) ?? ''); data.set(path, value); return value; });
			queue = task.catch(() => {}); return task;
		},
	};
	const base = normalizeSettings(parse(data.get('data.json')!));
	return { data, files, base };
}

describe('atomic settings owner', () => {
	it('keeps an unrelated writer committed after the captured read and preserves unknown fields', async () => {
		const { data, files, base } = fixture();
		const originalWrite = files.write.bind(files);
		files.write = async (path, value) => {
			await originalWrite(path, value);
			if (path.includes('recovery-')) {
				const current = parse(data.get('data.json')!);
				current.appearanceRules.External = { text: { bold: true, strikethrough: false, cascade: false }, futureText: 'keep' };
				data.set('data.json', JSON.stringify(current));
			}
		};
		await publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true });
		const saved = parse(data.get('data.json')!);
		expect(saved.future).toEqual({ kept: true });
		expect(saved.appearanceRules.External.futureText).toBe('keep');
		expect(saved.showHiddenItems).toBe(true);
	});
	it('rejects a conflicting edit and retains both readable source and recovery request', async () => {
		const { data, files, base } = fixture();
		const intended = { ...base, paletteTemplateId: 'ember' as const };
		files.process = async (_path, edit) => {
			const external = JSON.stringify({ ...base, paletteTemplateId: 'ocean-depth' }); data.set('data.json', external);
			return edit(external);
		};
		await expect(publishSettings(files, 'data.json', base, intended)).rejects.toThrow(/Settings conflict/);
		expect(parse(data.get('data.json')!).paletteTemplateId).toBe('ocean-depth');
		expect([...data].find(([path]) => path.includes('recovery-'))?.[1]).toContain('prepared');
	});
	it('retains the old readable file and original bytes after atomic write failure', async () => {
		const { data, files, base } = fixture(); const original = data.get('data.json');
		files.process = vi.fn().mockRejectedValue(new Error('disk full'));
		await expect(publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true })).rejects.toThrow(/Recovery request/);
		expect(data.get('data.json')).toBe(original);
		expect(parse([...data].find(([path]) => path.includes('recovery-'))![1]).original).toBe(original);
	});
	it('joins atomic host publication for two unrelated cooperating saves', async () => {
		const { data, files, base } = fixture();
		await Promise.all([publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true }), publishSettings(files, 'data.json', base, { ...base, vaultMarker: 'off' })]);
		const saved = parse(data.get('data.json')!); expect(saved.showHiddenItems).toBe(true); expect(saved.vaultMarker).toBe('off');
	});
	it('never writes a future schema and keeps a migration source', async () => {
		const { data, files, base } = fixture(); data.set('data.json', '{"schemaVersion":99,"secretFuture":"fixture"}');
		await expect(publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true })).rejects.toThrow(/newer Folder Toolkit/);
		expect(data.size).toBe(1); expect(data.get('data.json')).toContain('99');
		data.set('data.json', JSON.stringify({ schemaVersion: 4, appearanceRules: {}, conditionalFormats: [] }));
		await publishSettings(files, 'data.json', normalizeSettings(parse(data.get('data.json')!)), { ...base, showHiddenItems: true });
		expect(parse([...data].find(([path]) => path.includes('recovery-'))![1]).original).toContain('"schemaVersion":4');
	});
	it('keeps unknown nested rule fields during a known partial rule edit', async () => {
		const { data, files } = fixture(); const raw = parse(data.get('data.json')!);
		raw.appearanceRules.Folder = { text: { bold: true, strikethrough: false, cascade: false, future: 'keep' }, futureRule: 9 };
		data.set('data.json', JSON.stringify(raw)); const base = normalizeSettings(raw); const intended = structuredClone(base); intended.appearanceRules.Folder.text!.bold = false;
		await publishSettings(files, 'data.json', base, intended);
		const rule = parse(data.get('data.json')!).appearanceRules.Folder; expect(rule.futureRule).toBe(9); expect(rule.text?.future).toBe('keep'); expect(rule.text?.bold).toBe(false);
	});
});

it('creates a missing settings file through create-only publication', async () => {
	const { data, files } = fixture(); data.delete('data.json');
	await publishSettings(files, 'data.json', normalizeSettings(DEFAULT_SETTINGS), { ...normalizeSettings(DEFAULT_SETTINGS), showHiddenItems: true });
	expect(parse(data.get('data.json')!).showHiddenItems).toBe(true);
});
it('merges a competing creator without overwriting its unrelated fields', async () => {
	const { data, files } = fixture(); data.delete('data.json');
	files.copy = async () => { data.set('data.json', JSON.stringify({ ...DEFAULT_SETTINGS, future: 'creator' })); throw new Error('EEXIST'); };
	await publishSettings(files, 'data.json', normalizeSettings(DEFAULT_SETTINGS), { ...normalizeSettings(DEFAULT_SETTINGS), showHiddenItems: true });
	expect(parse(data.get('data.json')!).future).toBe('creator');
});

it('does not publish a settings write after its owner is disposed during the read', async () => {
	const { data, files, base } = fixture(); const original = data.get('data.json'); let active = true; let release!: () => void; let started!: () => void;
	const start = new Promise<void>(resolve => { started = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
	const read = files.read.bind(files); files.read = async path => { const text = await read(path); started(); await barrier; return text; };
	const pending = publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true }, () => active); await start; active = false; release();
	await expect(pending).rejects.toThrow('closed'); expect(data.size).toBe(1); expect(data.get('data.json')).toBe(original);
});


it('captures the settings request before an asynchronous read', async () => {
	const { data, files, base } = fixture(); let release!: () => void; let began!: () => void;
	const started = new Promise<void>(resolve => { began = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
	const read = files.read.bind(files); files.read = async path => { const result = await read(path); began(); await barrier; return result; };
	const intended = { ...base, showHiddenItems: true };
	const pending = publishSettings(files, 'data.json', base, intended);
	await started; intended.showHiddenItems = false; release(); await pending;
	expect(parse(data.get('data.json')!).showHiddenItems).toBe(true);
});
it('does not bootstrap a settings target after disposal while staging its candidate', async () => {
	const { data, files, base } = fixture(); data.delete('data.json'); let release!: () => void; let began!: () => void; let active = true;
	const started = new Promise<void>(resolve => { began = resolve; }); const barrier = new Promise<void>(resolve => { release = resolve; });
	const write = files.write.bind(files); files.write = async (path, value) => { await write(path, value); if (path.endsWith('.initial')) { began(); await barrier; } };
	const pending = publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true }, () => active);
	await started; active = false; release(); await expect(pending).rejects.toThrow('closed');
	expect(data.has('data.json')).toBe(false);
	expect([...data.keys()].some(path => path.includes('recovery-'))).toBe(true);
});


it('refuses malformed structural settings and schema versions before changing their original bytes', async () => {
	for (const original of ['[]', '{"schemaVersion":"99"}', '{"schemaVersion":7,"appearanceRules":[]}']) {
		const { data, files, base } = fixture(); data.set('data.json', original);
		await expect(publishSettings(files, 'data.json', base, { ...base, showHiddenItems: true })).rejects.toThrow();
		expect(data.size).toBe(1); expect(data.get('data.json')).toBe(original);
	}
});
