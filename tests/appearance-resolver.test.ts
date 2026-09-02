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
	it('automatically contrasts text for strengthened backgrounds unless text is explicit', () => {
		const automaticSettings: FolderToolkitSettings = {
			...settings,
			appearanceRules: {
				A: { background: { choice: { kind: 'custom', hex: '#111111', strength: 100 }, cascade: true } },
				B: {
					background: { choice: { kind: 'custom', hex: '#111111', strength: 100 }, cascade: true },
					text: { choice: { kind: 'custom', hex: '#FF0000' }, cascade: true },
				},
			},
		};
		expect(resolveAppearance('A/note.md', { settings: automaticSettings }).text?.foregroundLight).toBe('#FFFFFF');
		expect(resolveAppearance('B/note.md', { settings: automaticSettings }).text?.hex).toBe('#FF0000');
	});
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

	it('keeps inherited backgrounds independent from descendant shading', () => {
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

		// Subfolder gets both the row-sized inherited background and its group shading.
		const sub = resolveAppearance('Root/Sub', { settings: settingsWithDescendants });
		expect(sub.border?.style).toBe('box');
		expect(sub.border?.shading).toBe(true);
		expect(sub.background?.hex).toBe('#3498DB');

		// Files retain the same inherited background for explorer rows and open tabs.
		const fileInSub = resolveAppearance('Root/Sub/file.md', { settings: settingsWithDescendants });
		expect(fileInSub.background?.hex).toBe('#3498DB');

		// File directly in Root gets Root background
		const fileInRoot = resolveAppearance('Root/file.md', { settings: settingsWithDescendants });
		expect(fileInRoot.background?.hex).toBe('#3498DB');
	});

	it('applies alternating descendant borders only 1 level down from root', () => {
		const settingsWithDescendants: FolderToolkitSettings = {
			...settings,
			appearanceRules: {
				Root: {
					descendants: { enabled: true, style: 'box', thickness: 'thin', shading: true },
				},
			},
		};
		// Direct child folder gets descendant border
		const directSub = resolveAppearance('Root/Sub1', { settings: settingsWithDescendants });
		expect(directSub.border?.style).toBe('box');

		// Deeper nested folder does NOT get descendant border
		const deepSub = resolveAppearance('Root/Sub1/NestedSub', { settings: settingsWithDescendants });
		expect(deepSub.border).toBeNull();
	});
});
