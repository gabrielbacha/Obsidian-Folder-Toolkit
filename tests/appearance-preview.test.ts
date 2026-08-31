import { describe, expect, it } from 'vitest';
import { resolveAppearance } from '../src/appearance-resolver';
import { AppearancePreviewStore } from '../src/appearance-preview';
import type { FolderToolkitSettings } from '../src/types';

function settings(): FolderToolkitSettings {
	return {
		schemaVersion: 1,
		paletteTemplateId: 'default',
		tabStyle: 'background',
		appearanceRules: {
			A: { text: { choice: { kind: 'preset', slot: 0 }, cascade: true } },
		},
		hiddenPaths: [],
		showHiddenItems: false,
	};
}

describe('AppearancePreviewStore', () => {
	it('overlays draft rules without mutating persisted settings', () => {
		const persisted = settings();
		const previews = new AppearancePreviewStore();
		previews.set('A', {
			background: { choice: { kind: 'preset', slot: 1 }, cascade: true },
			border: { style: 'rail', color: { kind: 'preset', slot: 2 } },
		});
		const effective = previews.apply(persisted);
		expect(resolveAppearance('A/note.md', { settings: effective }).background?.hex).toBe('#3498DB');
		expect(resolveAppearance('A', { settings: effective }).border?.style).toBe('rail');
		expect(persisted.appearanceRules.A?.background).toBeUndefined();
		expect(persisted.appearanceRules.A?.text).toBeDefined();
	});

	it('previews clearing a direct rule and restores it when cleared', () => {
		const persisted = settings();
		const previews = new AppearancePreviewStore();
		previews.set('A', {});
		expect(resolveAppearance('A/note.md', { settings: previews.apply(persisted) }).text).toBeNull();
		previews.clear('A');
		expect(previews.apply(persisted)).toBe(persisted);
		expect(resolveAppearance('A/note.md', { settings: persisted }).text?.hex).toBe('#16A085');
	});

	it('keeps a selected background active while an omitted border stays disabled', () => {
		const persisted = settings();
		const previews = new AppearancePreviewStore();
		previews.set('A', {
			background: { choice: { kind: 'preset', slot: 1 }, cascade: true },
		});
		const effective = previews.apply(persisted);
		expect(resolveAppearance('A', { settings: effective }).background?.hex).toBe('#3498DB');
		expect(resolveAppearance('A', { settings: effective }).border).toBeNull();
	});

	it('clears transient rules with their subtree', () => {
		const persisted = settings();
		const previews = new AppearancePreviewStore();
		previews.set('A/B', { text: { choice: { kind: 'preset', slot: 3 }, cascade: true } });
		expect(resolveAppearance('A/B/note.md', { settings: previews.apply(persisted) }).text?.hex).toBe('#2C3E50');
		previews.clearSubtree('A');
		expect(previews.apply(persisted)).toBe(persisted);
	});
});
