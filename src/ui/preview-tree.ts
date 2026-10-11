import { setIcon } from 'obsidian';
import { resolveAppearance } from '../appearance-resolver';
import type { AppearanceRule, FolderToolkitSettings } from '../types';

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
export function buildPreviewTree(container: HTMLElement, path: string, isFolder: boolean, size: PreviewTreeSize): PreviewTree {
	const tree = container.createDiv(size === 'compact' ? 'ft-preview-tree ft-preview-tree--compact' : 'ft-preview-tree');
	const rows: PreviewRow[] = [];
	const subfolderOrder: string[] = [];

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

/** Applies `rule` to `path` on top of the saved settings and paints every sample row. */
export function stylePreviewTree(tree: PreviewTree, baseSettings: FolderToolkitSettings, path: string, rule: AppearanceRule): void {
	const appearanceRules = { ...baseSettings.appearanceRules };
	if (Object.keys(rule).length === 0) delete appearanceRules[path];
	else appearanceRules[path] = structuredClone(rule);
	const settings = { ...baseSettings, appearanceRules };
	const getDescendantIndex = (candidate: string) => Math.max(0, tree.subfolderOrder.indexOf(candidate));

	for (const { path: rowPath, el, titleEl, isFolder, relation } of tree.rows) {
		const appearance = resolveAppearance(rowPath, { settings, getDescendantIndex, isFolder });
		const directBackground = appearanceRules[rowPath]?.background;
		const directHasColor = directBackground !== undefined && directBackground.choice.kind !== 'none';
		const directBlocks = directBackground?.choice.kind === 'none';
		const directCascades = isFolder && directBackground?.cascade === true;
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
		el.classList.toggle('ft-preview-border-shaded', border?.shading === true);

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
			const thicknessMap = border.style === 'box'
				? { thin: '1px', medium: '2px', thick: '3px' }
				: { thin: '2px', medium: '4px', thick: '6px' };
			el.style.setProperty('--ft-preview-border-width', thicknessMap[border.thickness ?? 'thin']);
		}
	}
}
