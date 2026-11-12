import { normalizeSettings } from './settings';
import { SCHEMA_VERSION, DEFAULT_SETTINGS, type FolderToolkitSettings } from './types';

export interface SettingsFiles {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	/** Public Obsidian DataAdapter.process: atomically read, modify, and save. */
	copy?(source: string, target: string): Promise<void>;
	remove?(path: string): Promise<void>;
	process(path: string, edit: (data: string) => string): Promise<string>;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

/** Apply only changed known fields; preserve unknown fields and reject a conflicting writer. */
export function mergeSettingsPatch(base: unknown, intended: unknown, current: unknown, path = '', currentKnown = current): unknown {
	if (equal(base, intended)) return current;
	if (object(base) && object(intended) && object(currentKnown)) {
		const result = Object.assign(Object.create(null) as Record<string, unknown>, object(current) ? current : {});
		for (const key of new Set([...Object.keys(base), ...Object.keys(intended)])) {
			if (equal(base[key], intended[key])) continue;
			const next = mergeSettingsPatch(base[key], intended[key], object(current) ? current[key] : undefined, `${path}/${key}`, currentKnown[key]);
			if (next === undefined) delete result[key]; else result[key] = next;
		}
		return result;
	}
	if (!equal(currentKnown, base) && !equal(currentKnown, intended)) throw new Error(`Settings conflict at ${path}. Reload and apply the edit again.`);
	return structuredClone(intended);
}

/** Atomic publication is owned by the host adapter; recovery requests are never auto-replayed. */
export async function publishSettings(
	files: SettingsFiles, path: string, base: unknown, intended: unknown, canPublish: () => boolean = () => true,
): Promise<FolderToolkitSettings> {
	base = structuredClone(base);
	intended = structuredClone(intended);
	if (typeof files.process !== 'function') throw new Error('Atomic settings writes are unavailable. Update Obsidian before saving.');
	const original = await files.exists(path) ? await files.read(path) : '';
	// Refuse corrupt/future data before creating any candidate publication.
	const raw: unknown = original ? JSON.parse(original) : structuredClone(DEFAULT_SETTINGS);
	normalizeSettings(raw);
	if (!canPublish()) throw new Error('Settings owner is closed.');
	const recovery = `${path}.recovery-${crypto.randomUUID()}.json`;
	await files.write(recovery, JSON.stringify({ version: 1, path, original, base, intended, state: 'prepared' }));
	try {
		if (!canPublish()) throw new Error('Settings owner is closed.');
		if (!await files.exists(path)) {
			if (!canPublish()) throw new Error('Settings owner is closed.');
			if (!files.copy) throw new Error('Create-only settings publication is unavailable. Update Obsidian.');
			const initial = `${recovery}.initial`;
			await files.write(initial, JSON.stringify(DEFAULT_SETTINGS));
			if (!canPublish()) throw new Error('Settings owner is closed.');
			try { await files.copy(initial, path); }
			catch (error) { if (!await files.exists(path)) throw error; }
			// copy() refuses an existing destination; a competing creator is merged by process().
		}
		const published = await files.process(path, (text) => {
			if (!canPublish()) throw new Error('Settings owner is closed.');
			const latest: unknown = text ? JSON.parse(text) : structuredClone(DEFAULT_SETTINGS);
			normalizeSettings(latest);
			const merged = mergeSettingsPatch(normalizeSettings(base), normalizeSettings(intended), latest, '', normalizeSettings(latest)) as Record<string, unknown>;
			merged.schemaVersion = SCHEMA_VERSION;
			return JSON.stringify(merged, null, 2);
		});
		const settings = normalizeSettings(JSON.parse(published));
		// A failed receipt must not turn a confirmed publication into a request to repeat it.
		await files.write(recovery, JSON.stringify({ version: 1, path, original, base, intended, state: 'published', published }))
			.catch((error: unknown) => console.warn('Folder Toolkit: settings saved; recovery receipt remains prepared.', error));
		if (files.remove) await files.remove(`${recovery}.initial`).catch(() => undefined);
		if (object(raw) && raw.schemaVersion === SCHEMA_VERSION && files.remove) await files.remove(recovery).catch((error: unknown) => console.warn('Folder Toolkit: retained a completed recovery receipt.', error));
		return settings;
	} catch (error) {
		throw Object.assign(new Error(`Settings were not confirmed. Recovery request: ${recovery}. ${error instanceof Error ? error.message : String(error)}`), { cause: error });
	}
}
