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
			border: { style: 'box', color: { kind: 'preset', slot: 2 }, thickness: 'thin', shade: false, scope: 'self' },
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

	it('cycles inherited subfolder borders through distinct palette colors', () => {
		const cascaded = structuredClone(settings);
		cascaded.appearanceRules.A.border = {
			style: 'rail',
			color: { kind: 'preset', slot: 1 },
			thickness: 'thick',
			shade: true,
			scope: 'both',
		};
		const root = resolveAppearance('A', cascaded);
		const firstChild = resolveAppearance('A/B', cascaded, { borderPaletteOffset: 0 });
		const secondChild = resolveAppearance('A/C', cascaded, { borderPaletteOffset: 1 });
		expect(root.border).toMatchObject({ inherited: false, thickness: 'thick', shade: true, color: { hex: '#3498DB' } });
		expect(firstChild.border).toMatchObject({ inherited: true, color: { hex: '#8E44AD' } });
		expect(secondChild.border).toMatchObject({ inherited: true, color: { hex: '#2C3E50' } });
	});

	it('lets direct borders override cascades and no-border rules block a subtree', () => {
		const cascaded = structuredClone(settings);
		cascaded.appearanceRules.A.border = {
			style: 'box', color: { kind: 'preset', slot: 2 }, thickness: 'thin', shade: false, scope: 'both',
		};
		cascaded.appearanceRules['A/B'].border = {
			style: 'rail', color: { kind: 'preset', slot: 7 }, thickness: 'medium', shade: false, scope: 'self',
		};
		expect(resolveAppearance('A/B', cascaded).border?.color.hex).toBe('#C0392B');
		cascaded.appearanceRules['A/B'].border = {
			style: 'rail', color: { kind: 'none' }, thickness: 'medium', shade: false, scope: 'both',
		};
		expect(resolveAppearance('A/B', cascaded).border).toBeNull();
		expect(resolveAppearance('A/B/Deep', cascaded).border).toBeNull();
	});
});
