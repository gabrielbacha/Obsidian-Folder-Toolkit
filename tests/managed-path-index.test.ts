import { describe, expect, it } from 'vitest';
import { ManagedPathIndex } from '../src/managed-path-index';
import { DEFAULT_SETTINGS } from '../src/types';

describe('revision-owned managed-path search index', () => {
	it('reads rule keys once until its settings/path revision changes', () => {
		let reads = 0;
		const rules = new Proxy({ Folder: {} }, { ownKeys: target => { reads += 1; return Reflect.ownKeys(target); } });
		const settings = { ...DEFAULT_SETTINGS, appearanceRules: rules, hiddenPaths: ['Hidden'] };
		const index = new ManagedPathIndex();
		const first = index.read(settings, '0:0');
		for (const query of ['f', 'fo', 'folder']) expect(index.read(settings, '0:0').appearance.filter(entry => entry.search.includes(query))).toHaveLength(1);
		expect(reads).toBe(1); expect(index.read(settings, '0:0')).toBe(first);
		expect(index.read(settings, '0:1')).not.toBe(first); expect(reads).toBe(2);
	});
});
