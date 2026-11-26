import { appearancePresentation } from '../appearance-presentation';
import { setIcon } from 'obsidian';
import { resolveAppearance } from '../appearance-resolver';
import type { AppearanceRule, ConditionalFormatRule, FolderToolkitSettings } from '../types';

type PreviewRelation = 'root' | 'ancestor' | 'descendant' | 'sibling';

export interface PreviewRow {
	path: string;
	el: HTMLElement;
	titleEl: HTMLElement;
	isFolder: boolean;
	relation: PreviewRelation;
}

export interface PreviewTree {
	rows: PreviewRow[];
	/** Explorer order of the sample's direct subfolders, used for alternating subfolder colors. */
	subfolderOrder: string[];
}

export type PreviewTreeSize = 'full' | 'compact';

const PREVIEW_STYLE_PROPERTIES = [
	'--ft-preview-text-light', '--ft-preview-text-dark', '--ft-preview-text-strength',
	'--ft-preview-background', '--ft-preview-background-strength',
	'--ft-preview-border', '--ft-preview-border-strength', '--ft-preview-border-width',
	'--ft-preview-shading-strength',
] as const;

function parentPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '' : path.slice(0, index);
}

function joinPath(parent: string, name: string): string {
	return parent ? `${parent}/${name}` : name;
}

/**
 * Builds a sample explorer tree for `path` inside `container`. The full size is
 * the editor's main preview; the compact size is a smaller sample sized for
 * preset buttons. Rows carry explorer class names so the shared preview CSS
 * renders them like the real file explorer.
 */
function rowFactory(rows: PreviewRow[]) {
	const folderRow = (parent: HTMLElement, name: string, rowPath: string, relation: PreviewRelation, collapsed = false) => {
		const folderContainer = parent.createDiv('nav-folder');
		const titleRow = folderContainer.createDiv('ft-live-preview__row ft-live-preview__folder-title nav-folder-title');
		const icon = titleRow.createDiv('nav-folder-collapse-indicator collapse-icon' + (collapsed ? ' is-collapsed' : ''));
		setIcon(icon, collapsed ? 'chevron-right' : 'chevron-down');
		titleRow.createSpan({ text: name, cls: 'ft-live-preview__name nav-folder-title-content' });
		rows.push({ path: rowPath, el: folderContainer, titleEl: titleRow, isFolder: true, relation });
		const childrenContainer = folderContainer.createDiv('nav-folder-children ft-preview-children');
		if (collapsed) childrenContainer.hide();
		return childrenContainer;
	};

	const fileRow = (parent: HTMLElement, name: string, rowPath: string, relation: PreviewRelation) => {
		const row = parent.createDiv('ft-live-preview__row nav-file');
		row.createDiv('nav-folder-collapse-indicator collapse-icon');
		row.createSpan({ text: name, cls: 'ft-live-preview__name nav-file-title-content' });
		rows.push({ path: rowPath, el: row, titleEl: row, isFolder: false, relation });
	};
	return { folderRow, fileRow };
}

export function buildPreviewTree(container: HTMLElement, path: string, isFolder: boolean, size: PreviewTreeSize): PreviewTree {
	const tree = container.createDiv(size === 'compact' ? 'ft-preview-tree ft-preview-tree--compact' : 'ft-preview-tree');
	const rows: PreviewRow[] = [];
	const subfolderOrder: string[] = [];
	const { folderRow, fileRow } = rowFactory(rows);

	const rootName = path.split('/').at(-1) ?? path;
	if (!isFolder) {
		if (size === 'compact') fileRow(tree, 'Other note', joinPath(parentPath(path), 'Other note.md'), 'sibling');
		fileRow(tree, rootName.replace(/\.md$/i, ''), path, 'root');
		return { rows, subfolderOrder };
	}

	const children = folderRow(tree, rootName, path, 'root');
	if (size === 'compact') {
		const first = joinPath(path, 'Subfolder A');
		const second = joinPath(path, 'Subfolder B');
		subfolderOrder.push(first, second);
		const firstChildren = folderRow(children, 'Subfolder A', first, 'descendant');
		fileRow(firstChildren, 'Note', joinPath(first, 'Note.md'), 'descendant');
		folderRow(children, 'Subfolder B', second, 'descendant', true);
		fileRow(children, 'Note', joinPath(path, 'Note.md'), 'descendant');
		return { rows, subfolderOrder };
	}

	const collapsedPath = joinPath(path, 'Subfolder 1');
	subfolderOrder.push(collapsedPath);
	folderRow(children, 'Subfolder 1', collapsedPath, 'descendant', true);
	for (let i = 2; i <= 3; i += 1) {
		const subfolderPath = joinPath(path, `Subfolder ${i}`);
		subfolderOrder.push(subfolderPath);
		const subChildren = folderRow(children, `Subfolder ${i}`, subfolderPath, 'descendant');
		fileRow(subChildren, `File ${i}.1`, joinPath(subfolderPath, `File ${i}.1`), 'descendant');
	}
	fileRow(children, 'File 1', joinPath(path, 'File 1'), 'descendant');
	return { rows, subfolderOrder };
}

const SAMPLE_ROOT = 'Folder Toolkit sample';

/**
 * Builds one explorer row for `path`, collapsed if it is a folder. List rows in the
 * settings use it to show an item, a preset or a name rule in its real style.
 */
export function buildSampleRow(container: HTMLElement, name: string, path: string, isFolder: boolean): PreviewTree {
	const tree = container.createDiv('ft-preview-tree ft-preview-tree--compact ft-preview-tree--row');
	const rows: PreviewRow[] = [];
	const { folderRow, fileRow } = rowFactory(rows);
	if (isFolder) folderRow(tree, name, path, 'root', true);
	else fileRow(tree, name, path, 'root');
	return { rows, subfolderOrder: [] };
}

/** The sample path that `buildSampleRow` uses for a preset or a name rule. */
export function samplePath(name: string, isFolder: boolean): string {
	return `${SAMPLE_ROOT}/${isFolder || /\.[a-z0-9]+$/i.test(name) ? name : `${name}.md`}`;
}

/** A sample name that the rule matches, made from its pattern. */
export function conditionalSampleName(rule: Pick<ConditionalFormatRule, 'match' | 'pattern'>): string {
	const pattern = rule.pattern.trim();
	switch (rule.match) {
		case 'equals': return pattern;
		case 'startsWith': return `${pattern} notes`;
		case 'endsWith': return `Project ${pattern}`;
		case 'contains': return `My ${pattern} list`;
	}
}

/**
 * Builds a small sample explorer for a name rule: the items it matches, by its target,
 * and one item that does not match. Returns null and shows a hint when the pattern is empty.
 */
export function buildConditionalSample(container: HTMLElement, rule: ConditionalFormatRule): PreviewTree | null {
	if (!rule.pattern.trim()) {
		container.createDiv({ text: 'Type a pattern to see a preview.', cls: 'ft-conditional-preview__hint' });
		return null;
	}
	const tree = container.createDiv('ft-preview-tree ft-preview-tree--compact ft-conditional-preview__tree');
	const rows: PreviewRow[] = [];
	const { folderRow, fileRow } = rowFactory(rows);
	const name = conditionalSampleName(rule);
	const fileName = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.md`;
	if (rule.target !== 'file') folderRow(tree, name, `${SAMPLE_ROOT}/${name}`, 'sibling', true);
	if (rule.target !== 'folder') fileRow(tree, name.replace(/\.md$/i, ''), `${SAMPLE_ROOT}/${fileName}`, 'sibling');
	if (rule.target === 'folder') folderRow(tree, 'Other folder', `${SAMPLE_ROOT}/Other folder`, 'sibling', true);
	else fileRow(tree, 'Other note', `${SAMPLE_ROOT}/Other note.md`, 'sibling');
	return { rows, subfolderOrder: [] };
}

/** Paints a conditional sample with only `rule`, on the palette of `baseSettings`. */
export function styleConditionalSample(tree: PreviewTree, baseSettings: FolderToolkitSettings, rule: ConditionalFormatRule): void {
	const { scope: _scope, ...unscoped } = rule;
	stylePreviewRows(tree, {
		...baseSettings,
		appearanceRules: Object.create(null) as Record<string, AppearanceRule>,
		conditionalFormats: [unscoped],
	});
}

/** Applies `rule` to `path` on top of the saved settings and paints every sample row. */
export function stylePreviewTree(tree: PreviewTree, baseSettings: FolderToolkitSettings, path: string, rule: AppearanceRule): void {
	// Read-only overlay: one draft shadows a shared rule index without cloning the full vault map.
	const appearanceRules = Object.create(baseSettings.appearanceRules) as Record<string, AppearanceRule>;
	Object.defineProperty(appearanceRules, path, { value: rule, enumerable: true, configurable: true });
	stylePreviewRows(tree, { ...baseSettings, appearanceRules });
}

/** Paints every sample row as the explorer would show it with `settings`. */
export function stylePreviewRows(tree: PreviewTree, settings: FolderToolkitSettings): void {
	const getDescendantIndex = (candidate: string) => Math.max(0, tree.subfolderOrder.indexOf(candidate));

	for (const { path: rowPath, el, titleEl, isFolder, relation } of tree.rows) {
		const appearance = resolveAppearance(rowPath, { settings, getDescendantIndex, isFolder });
		const presentation = appearancePresentation(appearance, isFolder);
		const directBackground = appearance.directBackground;
		const directHasColor = presentation.directColor;
		const directBlocks = presentation.blocked;
		const directCascades = presentation.cascade;
		titleEl.classList.toggle('ft-preview-has-text', appearance.text !== null);
		titleEl.classList.toggle('ft-preview-is-bold', appearance.bold);
		titleEl.classList.toggle('ft-preview-is-strikethrough', appearance.strikethrough);
		el.classList.toggle('ft-preview-background-cascade', directHasColor && directCascades);
		el.classList.toggle('ft-preview-background-block', directBlocks);
		el.classList.toggle('ft-preview-background-block-cascade', directBlocks && directCascades);
		titleEl.classList.toggle(
			'ft-preview-has-background',
			appearance.background !== null && ((directHasColor && !directCascades) || (!directBackground && relation !== 'descendant')),
		);

		const border = appearance.border;
		el.classList.toggle('ft-preview-border-box', border?.style === 'box');
		el.classList.toggle('ft-preview-border-rail', border?.style === 'rail');
		el.classList.toggle('ft-preview-border-shaded', presentation.shaded);

		for (const property of PREVIEW_STYLE_PROPERTIES) {
			el.style.removeProperty(property);
			titleEl.style.removeProperty(property);
		}

		if (appearance.text) {
			el.style.setProperty('--ft-preview-text-light', appearance.text.foregroundLight);
			el.style.setProperty('--ft-preview-text-dark', appearance.text.foregroundDark);
			if (appearance.text.strength !== undefined) el.style.setProperty('--ft-preview-text-strength', `${appearance.text.strength}%`);
		}
		if (appearance.background) {
			for (const target of [el, titleEl]) {
				target.style.setProperty('--ft-preview-background', appearance.background.hex);
				if (appearance.background.strength !== undefined) {
					target.style.setProperty('--ft-preview-background-strength', `${appearance.background.strength}%`);
				}
			}
		}
		if (border) {
			el.style.setProperty('--ft-preview-border', border.color.hex);
			if (border.color.strength !== undefined) el.style.setProperty('--ft-preview-border-strength', `${border.color.strength}%`);
			el.style.setProperty('--ft-preview-border-width', presentation.borderWidth);
			if (border.shading && border.shadingStrength !== undefined) el.style.setProperty('--ft-preview-shading-strength', `${border.shadingStrength}%`);
		}
	}
}
