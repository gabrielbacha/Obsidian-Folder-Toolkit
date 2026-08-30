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
		const resolved = resolveAppearance('A/note.md', settings);
		expect(resolved.text?.hex).toBe('#16A085');
		expect(resolved.background?.hex).toBe('#3498DB');
		expect(resolved.border).toBeNull();
	});

	it('applies a non-cascading direct effect only to its own row', () => {
		expect(resolveAppearance('A/B', settings).text?.hex).toBe('#2C3E50');
		expect(resolveAppearance('A/B/note.md', settings).text?.hex).toBe('#16A085');
	});

	it('blocks inherited effects across a subtree', () => {
		expect(resolveAppearance('A/Blocked/note.md', settings).background).toBeNull();
		expect(resolveAppearance('A/Blocked/note.md', settings).text?.hex).toBe('#16A085');
	});

	it('anchors borders only to the folder with the rule', () => {
		expect(resolveAppearance('A', settings).border?.style).toBe('box');
		expect(resolveAppearance('A/B', settings).border).toBeNull();
	});
});
