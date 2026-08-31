import { describe, expect, it } from 'vitest';
import { resolveAppearance } from '../src/appearance-resolver';
import type { FolderToolkitSettings } from '../src/types';

const settings: FolderToolkitSettings = {
	schemaVersion: 1,
	paletteTemplateId: 'default',
	tabStyle: 'off',
	hiddenPaths: [],
	showHiddenItems: false,
	appearanceRules: {
		A: {
			text: { choice: { kind: 'preset', slot: 0 }, cascade: true },
			background: { choice: { kind: 'preset', slot: 1 }, cascade: true },
			border: { style: 'box', color: { kind: 'preset', slot: 2 } },
		},
		'A/B': { text: { choice: { kind: 'preset', slot: 3 }, cascade: false } },
		'A/Blocked': { background: { choice: { kind: 'none' }, cascade: true } },
	},
};

describe('appearance resolution', () => {
	it('inherits each effect independently', () => {
		const resolved = resolveAppearance('A/note.md', { settings });
		expect(resolved.text?.hex).toBe('#16A085');
		expect(resolved.background?.hex).toBe('#3498DB');
		expect(resolved.border).toBeNull();
	});

	it('applies a non-cascading direct effect only to its own row', () => {
		expect(resolveAppearance('A/B', { settings }).text?.hex).toBe('#2C3E50');
		expect(resolveAppearance('A/B/note.md', { settings }).text?.hex).toBe('#16A085');
	});

	it('blocks inherited effects across a subtree', () => {
		expect(resolveAppearance('A/Blocked/note.md', { settings }).background).toBeNull();
		expect(resolveAppearance('A/Blocked/note.md', { settings }).text?.hex).toBe('#16A085');
	});

	it('anchors borders only to the folder with the rule', () => {
		expect(resolveAppearance('A', { settings }).border?.style).toBe('box');
		expect(resolveAppearance('A/B', { settings }).border).toBeNull();
	});

	it('overrides ancestor background cascade when descendant shading is active', () => {
		const settingsWithDescendants: FolderToolkitSettings = {
			...settings,
			appearanceRules: {
				Root: {
					background: { choice: { kind: 'preset', slot: 1 }, cascade: true },
					border: { style: 'rail', color: { kind: 'preset', slot: 2 }, shading: true },
					descendants: { enabled: true, style: 'box', thickness: 'thin', shading: true },
				},
			},
		};
		// Root has background
		const root = resolveAppearance('Root', { settings: settingsWithDescendants });
		expect(root.background?.hex).toBe('#3498DB');
		expect(root.border?.style).toBe('rail');

		// Subfolder inherits alternating descendant border with shading and does NOT get Root background
		const sub = resolveAppearance('Root/Sub', { settings: settingsWithDescendants });
		expect(sub.border?.style).toBe('box');
		expect(sub.border?.shading).toBe(true);
		expect(sub.background).toBeNull();

		// File inside Sub inherits Sub shading (no background override)
		const fileInSub = resolveAppearance('Root/Sub/file.md', { settings: settingsWithDescendants });
		expect(fileInSub.background).toBeNull();

		// File directly in Root gets Root background
		const fileInRoot = resolveAppearance('Root/file.md', { settings: settingsWithDescendants });
		expect(fileInRoot.background?.hex).toBe('#3498DB');
	});
});
