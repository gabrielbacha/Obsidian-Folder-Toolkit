import type { FolderToolkitSettings } from './types';

export interface IndexedPath { path: string; search: string; }
export interface ManagedPaths { appearance: IndexedPath[]; hidden: IndexedPath[]; }

/** One searchable path index per settings/path revision, not per keystroke. */
export class ManagedPathIndex {
	private cached: { settings: FolderToolkitSettings; revision: string; data: ManagedPaths } | null = null;
	read(settings: FolderToolkitSettings, revision: string): ManagedPaths {
		if (this.cached?.settings === settings && this.cached.revision === revision) return this.cached.data;
		const index = (paths: string[]): IndexedPath[] => paths.sort().map(path => ({ path, search: path.toLocaleLowerCase() }));
		const data = { appearance: index(Object.keys(settings.appearanceRules)), hidden: index([...settings.hiddenPaths]) };
		this.cached = { settings, revision, data };
		return data;
	}
}
