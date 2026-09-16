import { describe, expect, it } from 'vitest';
import { resolveAppearance } from '../src/appearance-resolver';
import type { FolderToolkitSettings } from '../src/types';

const settings: FolderToolkitSettings = {
	schemaVersion: 1,
	paletteTemplateId: 'default',
	tabStyle: 'off',
	conditionalFormats: [],
	hiddenPaths: [],
	showHiddenItems: false,
	appearanceRules: {
		A: {
			text: { color: { kind: 'preset', slot: 0 }, bold: false, strikethrough: false, cascade: true },
			background: { choice: { kind: 'preset', slot: 1 }, cascade: true },
			border: { style: 'box', color: { kind: 'preset', slot: 2 } },
		},
		'A/B': { text: { color: { kind: 'preset', slot: 3 }, bold: false, strikethrough: false, cascade: false } },
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
					text: { color: { kind: 'custom', hex: '#FF0000' }, bold: false, strikethrough: false, cascade: true },
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

	it('resolves direct and conditional borders for files and folders with explicit blockers', () => {
		const borderSettings: FolderToolkitSettings = {
			...settings,
			appearanceRules: {
				Root: { descendants: { enabled: true, style: 'rail', thickness: 'thick', shading: true } },
				'Root/direct.md': { border: { style: 'box', color: { kind: 'custom', hex: '#112233', strength: 70 }, thickness: 'medium' } },
				'Root/blocked.md': { border: { kind: 'none' } },
				'Root/BlockedFolder': { border: { kind: 'none' } },
			},
			conditionalFormats: [
				{
					id: 'first', target: 'both', match: 'contains', pattern: 'rule',
					fontEnabled: false, color: { kind: 'custom', hex: '#FFFFFF' }, borderEnabled: true,
					border: { style: 'box', color: { kind: 'preset', slot: 1 }, thickness: 'thin' },
				},
				{
					id: 'last', target: 'both', match: 'contains', pattern: 'rule',
					fontEnabled: false, color: { kind: 'custom', hex: '#FFFFFF' }, borderEnabled: true,
					border: { style: 'rail', color: { kind: 'preset', slot: 2, strength: 65 }, thickness: 'thick' },
				},
			],
		};

		expect(resolveAppearance('Root/direct.md', { settings: borderSettings, isFolder: false }).border).toMatchObject({
			style: 'box', color: { hex: '#112233', strength: 70 }, thickness: 'medium',
		});
		expect(resolveAppearance('Root/rule.md', { settings: borderSettings, isFolder: false }).border).toMatchObject({
			style: 'rail', color: { hex: '#8E44AD', strength: 65 }, thickness: 'thick',
		});
		expect(resolveAppearance('Root/rule-folder', { settings: borderSettings, isFolder: true }).border?.style).toBe('rail');
		expect(resolveAppearance('Root/blocked.md', { settings: borderSettings, isFolder: false }).border).toBeNull();
		expect(resolveAppearance('Root/BlockedFolder', { settings: borderSettings, isFolder: true }).border).toBeNull();
		expect(resolveAppearance('Root/ordinary', { settings: borderSettings, isFolder: true }).border).toMatchObject({
			style: 'rail', thickness: 'thick', shading: true,
		});
	});

	it('matches reusable name rules by item type and lets exact paths override them', () => {
		const conditionalSettings: FolderToolkitSettings = {
			...settings,
			conditionalFormats: [
				{
					id: 'system-folders',
					target: 'folder',
					match: 'equals',
					pattern: '__system',
					fontEnabled: true,
					color: { kind: 'custom', hex: '#A8ADB5', strength: 65 },
				},
				{
					id: 'archive-files',
					target: 'file',
					match: 'startsWith',
					pattern: '__archive',
					fontEnabled: false,
					backgroundEnabled: true,
					color: { kind: 'custom', hex: '#B0B0B0', strength: 16 },
				},
				{
					id: 'basefiles-folders',
					target: 'folder',
					match: 'endsWith',
					pattern: '_basefiles',
					fontEnabled: true,
					color: { kind: 'custom', hex: '#A8ADB5', strength: 65 },
				},
			],
		};

		expect(resolveAppearance('Root/__system', { settings: conditionalSettings, isFolder: true }).text?.hex).toBe('#A8ADB5');
		expect(resolveAppearance('Root/__system', { settings: conditionalSettings, isFolder: true }).background).toBeNull();
		expect(resolveAppearance('Root/__system', { settings: conditionalSettings, isFolder: false }).text).toBeNull();
		expect(resolveAppearance('Root/__archive-2026.zip', { settings: conditionalSettings, isFolder: false }).background?.hex).toBe('#B0B0B0');
		expect(resolveAppearance('Root/__Archive-old.zip', { settings: conditionalSettings, isFolder: false }).background?.hex).toBe('#B0B0B0');
		expect(resolveAppearance('Root/project_basefiles', { settings: conditionalSettings, isFolder: true }).text?.hex).toBe('#A8ADB5');

		const exactOverride: FolderToolkitSettings = {
			...conditionalSettings,
			appearanceRules: {
				...conditionalSettings.appearanceRules,
				'Root/__archive-2026.zip': { background: { choice: { kind: 'custom', hex: '#FF0000' }, cascade: false } },
			},
		};
		expect(resolveAppearance('Root/__archive-2026.zip', { settings: exactOverride, isFolder: false }).background?.hex).toBe('#FF0000');
	});

	it('preserves 100% white font and allows simultaneous background and font control', () => {
		const dualSettings: FolderToolkitSettings = {
			...settings,
			conditionalFormats: [
				{
					id: 'white-font',
					target: 'file',
					match: 'startsWith',
					pattern: '__archive',
					fontEnabled: true,
					color: { kind: 'custom', hex: '#FFFFFF', strength: 100 },
				},
				{
					id: 'dark-bg',
					target: 'file',
					match: 'startsWith',
					pattern: '__archive',
					fontEnabled: false,
					backgroundEnabled: true,
					color: { kind: 'custom', hex: '#1E1E1E', strength: 80 },
				},
				{
					id: 'exact-file-without-ext',
					target: 'file',
					match: 'equals',
					pattern: 'special-note',
					fontEnabled: true,
					color: { kind: 'custom', hex: '#00FF00', strength: 100 },
				},
			],
		};

		const archiveFile = resolveAppearance('Personal/Digital Presence/__archive_GB_AI_Context.md', {
			settings: dualSettings,
			isFolder: false,
		});
		expect(archiveFile.text?.hex).toBe('#FFFFFF');
		expect(archiveFile.text?.foregroundLight).toBe('#FFFFFF');
		expect(archiveFile.text?.foregroundDark).toBe('#FFFFFF');
		expect(archiveFile.text?.strength).toBe(100);
		expect(archiveFile.background?.hex).toBe('#1E1E1E');
		expect(archiveFile.background?.strength).toBe(80);

		const matchedWithoutExt = resolveAppearance('Docs/special-note.md', {
			settings: dualSettings,
			isFolder: false,
		});
		expect(matchedWithoutExt.text?.hex).toBe('#00FF00');
	});

	it('controls both font and background colors from a single rule with effect both', () => {
		const singleRuleSettings: FolderToolkitSettings = {
			...settings,
			conditionalFormats: [
				{
					id: 'single-rule-both-colors',
					target: 'file',
					match: 'startsWith',
					pattern: '__archive',
					fontEnabled: true,
					backgroundEnabled: true,
					color: { kind: 'custom', hex: '#FFFFFF', strength: 100 },
					backgroundColor: { kind: 'custom', hex: '#1E1E1E', strength: 75 },
				},
			],
		};

		const archiveFile = resolveAppearance('Personal/Digital Presence/__archive_GB_AI_Context.md', {
			settings: singleRuleSettings,
			isFolder: false,
		});
		expect(archiveFile.text?.hex).toBe('#FFFFFF');
		expect(archiveFile.text?.foregroundLight).toBe('#FFFFFF');
		expect(archiveFile.text?.foregroundDark).toBe('#FFFFFF');
		expect(archiveFile.text?.strength).toBe(100);
		expect(archiveFile.background?.hex).toBe('#1E1E1E');
		expect(archiveFile.background?.strength).toBe(75);
	});

	it('resolves bold and strikethrough styles from conditional formatting rules', () => {
		const styledSettings: FolderToolkitSettings = {
			...settings,
			conditionalFormats: [
				{
					id: 'bold-and-strike',
					target: 'file',
					match: 'startsWith',
					pattern: '__archive',
					fontEnabled: false,
					color: { kind: 'custom', hex: '#FFFFFF', strength: 100 },
					backgroundEnabled: true,
					backgroundColor: { kind: 'custom', hex: '#333333', strength: 10 },
					bold: true,
					strikethrough: true,
				},
			],
		};

		const res = resolveAppearance('Docs/__archive-draft.md', {
			settings: styledSettings,
			isFolder: false,
		});
		expect(res.bold).toBe(true);
		expect(res.strikethrough).toBe(true);
		expect(res.text).toBeNull();
		expect(res.background?.hex).toBe('#333333');
	});

	it("resolves text color and typography independently with explicit off states", () => {
		const mixed: FolderToolkitSettings = {
			...settings,
			appearanceRules: {
				Root: { text: { bold: true, strikethrough: true, cascade: true } },
				"Root/__archive-direct.md": { text: { bold: false, strikethrough: false, cascade: false } },
			},
			conditionalFormats: [{
				id: "archive",
				target: "file",
				match: "startsWith",
				pattern: "__archive",
				fontEnabled: true,
				color: { kind: "custom", hex: "#C8C8C8", strength: 100 },
				bold: true,
				strikethrough: true,
			}],
		};

		const direct = resolveAppearance("Root/__archive-direct.md", { settings: mixed, isFolder: false });
		expect(direct.text?.hex).toBe("#C8C8C8");
		expect(direct.bold).toBe(false);
		expect(direct.strikethrough).toBe(false);

		const inherited = resolveAppearance("Root/plain.md", { settings: mixed, isFolder: false });
		expect(inherited.bold).toBe(true);
		expect(inherited.strikethrough).toBe(true);
	});

	it("uses the last matching conditional rule for typography before a cascading ancestor", () => {
		const precedence: FolderToolkitSettings = {
			...settings,
			appearanceRules: {
				Root: { text: { bold: true, strikethrough: true, cascade: true } },
			},
			conditionalFormats: [
				{
					id: "first",
					target: "file",
					match: "contains",
					pattern: "draft",
					fontEnabled: false,
					color: { kind: "custom", hex: "#FFFFFF" },
					bold: true,
					strikethrough: true,
				},
				{
					id: "later",
					target: "file",
					match: "contains",
					pattern: "draft",
					fontEnabled: false,
					color: { kind: "custom", hex: "#FFFFFF" },
					bold: false,
					strikethrough: false,
				},
			],
		};
		const resolved = resolveAppearance("Root/draft.md", { settings: precedence, isFolder: false });
		expect(resolved.bold).toBe(false);
		expect(resolved.strikethrough).toBe(false);
	});

});
