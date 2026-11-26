import { appearancePresentation } from './appearance-presentation';
import type { App } from 'obsidian';
import { hasDirectAppearance, resolveAppearance } from './appearance-resolver';
import { containingPathIndex } from './path-utils';
import { syncClass, syncStyle } from './dom-sync';
import { focusRelation } from './visibility';
import type { FolderToolkitSettings } from './types';

const MANAGED_CLASSES = [
	'ft-has-text', 'ft-has-background', 'ft-background-direct', 'ft-background-cascade',
	'ft-background-block', 'ft-background-block-cascade', 'ft-border-box', 'ft-border-rail',
	'ft-border-shaded', 'ft-direct-color-rule',
	'ft-permanent-hidden', 'ft-focus-hidden', 'ft-focus-ancestor', 'ft-focus-root',
	'ft-is-bold', 'ft-is-strikethrough', 'ft-vault-icon', 'ft-vault-border',
] as const;

const MANAGED_PROPERTIES = [
	'--ft-text-light', '--ft-text-dark', '--ft-background', '--ft-border', '--ft-border-width',
	'--ft-text-strength', '--ft-background-strength', '--ft-background-hover-strength', '--ft-border-strength',
	'--ft-shading-strength', '--ft-row-inset',
] as const;

/**
 * Obsidian 1.15 stretches each explorer row to the full pane width with an inline negative
 * `margin-inline-start` and a matching padding. Returns how far the row's own indent is from
 * the start of that stretched box, so row paint can start at the indent.
 */
export function rowInset(title: HTMLElement | null): number {
	if (!title) return 0;
	const declared = title.style.getPropertyValue('margin-inline-start')
		|| /margin-inline-start\s*:\s*([^;!]+)/i.exec(title.getAttribute('style') ?? '')?.[1]
		|| '';
	const match = /^\s*(-?\d+(?:\.\d+)?)px\s*$/.exec(declared);
	const margin = match ? Number(match[1]) : 0;
	return margin < 0 ? -margin : 0;
}

function isRowMutation(mutation: MutationRecord): boolean {
	if (mutation.type === 'childList') return true;
	const target = mutation.target as Element;
	return typeof target.matches === 'function' && target.matches('.tree-item-self, [data-path]');
}

function isHtmlElement(element: Element): element is HTMLElement {
	return 'style' in element && 'dataset' in element;
}

/** Nested vault lookups that the explorer needs. */
export interface ExplorerNestedVaults {
	/** Called with the folder paths that the explorer shows. */
	probe(folderPaths: string[]): void;
	isVaultRoot(path: string): boolean;
}

export class ExplorerManager {
	private readonly observers = new Map<HTMLElement, MutationObserver>();
	private frame: number | null = null;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => FolderToolkitSettings,
		private readonly getFocusPath: () => string | null,
		private readonly nestedVaults?: ExplorerNestedVaults,
	) {}

	start(): void {
		this.syncLeaves();
		this.reconcileSoon();
	}

	syncLeaves(): void {
		const activeRoots = new Set<HTMLElement>();
		for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
			const root = leaf.view.containerEl.querySelector<HTMLElement>('.nav-files-container')
				?? leaf.view.containerEl;
			activeRoots.add(root);
			if (this.observers.has(root)) continue;
			const Observer = root.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
			const observer = new Observer((mutations) => {
				if (mutations.some(isRowMutation)) this.reconcileSoon();
			});
			// Row titles carry the indent in their inline style and can be reused for another path.
			observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-path'] });
			this.observers.set(root, observer);
		}
		for (const [root, observer] of this.observers) {
			if (activeRoots.has(root) && root.isConnected) continue;
			observer.disconnect();
			this.clearRoot(root);
			this.observers.delete(root);
		}
		this.reconcileSoon();
	}

	reconcileSoon(): void {
		if (this.frame !== null) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = null;
			this.reconcile();
		});
	}

	reconcile(): void {
		const settings = this.getSettings();
		const focusPath = this.getFocusPath();
		const hidden = containingPathIndex(settings.hiddenPaths);
		for (const root of this.observers.keys()) {
			const rows = new Map<HTMLElement, string>();
			for (const pathElement of root.querySelectorAll<HTMLElement>('[data-path]')) {
				const path = pathElement.dataset.path;
				const row = pathElement.closest('.nav-folder, .nav-file');
				if (path && row && isHtmlElement(row)) rows.set(row, path);
			}
			const indices = new Map<HTMLElement, number>();
			const parents = new Set([...rows.keys()].map((row) => row.parentElement));
			for (const parent of parents) {
				let index = 0;
				for (const child of parent?.children ?? []) if (isHtmlElement(child) && child.classList.contains('nav-folder')) indices.set(child, index++);
			}
			for (const [row, path] of rows) this.applyRow(row, path, settings, focusPath, indices.get(row) ?? 0, hidden);
			this.nestedVaults?.probe([...rows].filter(([row]) => row.classList.contains('nav-folder')).map(([, path]) => path));
		}
	}

	stop(): void {
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		this.frame = null;
		for (const [root, observer] of this.observers) {
			observer.disconnect();
			this.clearRoot(root);
		}
		this.observers.clear();
	}

	private applyRow(
		row: HTMLElement,
		path: string,
		settings: FolderToolkitSettings,
		focusPath: string | null,
		folderIndex: number,
		hidden: (path: string) => string | null,
	): void {
		const isFolder = row.classList.contains('nav-folder');
		const context = {
			settings,
			getDescendantIndex: () => folderIndex,
			isFolder,
		};
		const appearance = resolveAppearance(path, context);
		const presentation = appearancePresentation(appearance, isFolder);
		const relation = focusRelation(path, focusPath);
		const hasText = appearance.text !== null;
		const hasBackground = appearance.background !== null;
		const directBackgroundHasColor = presentation.directColor;
		const directBackgroundBlocks = presentation.blocked;
		const directBackgroundCascades = presentation.cascade;

		syncClass(row, 'ft-direct-color-rule', hasDirectAppearance(settings.appearanceRules[path]));
		syncClass(row, 'ft-has-text', hasText);
		syncClass(row, 'ft-has-background', hasBackground);
		syncClass(row, 'ft-background-direct', directBackgroundHasColor);
		syncClass(row, 'ft-background-cascade', directBackgroundHasColor && directBackgroundCascades);
		syncClass(row, 'ft-background-block', directBackgroundBlocks);
		syncClass(row, 'ft-background-block-cascade', directBackgroundBlocks && directBackgroundCascades);

		if (appearance.border) {
			syncClass(row, 'ft-border-box', appearance.border.style === 'box');
			syncClass(row, 'ft-border-rail', appearance.border.style === 'rail');
			syncStyle(row.style, '--ft-border', appearance.border.color.hex);
			syncStyle(row.style, '--ft-border-strength', appearance.border.color.strength === undefined ? null : `${appearance.border.color.strength}%`);
			
			syncStyle(row.style, '--ft-border-width', presentation.borderWidth);

			syncClass(row, 'ft-border-shaded', presentation.shaded);
			const shadingStrength = appearance.border.shadingStrength;
			syncStyle(row.style, '--ft-shading-strength', presentation.shaded && shadingStrength !== undefined ? `${shadingStrength}%` : null);
		} else {
			syncClass(row, 'ft-border-box', false);
			syncClass(row, 'ft-border-rail', false);
			syncClass(row, 'ft-border-shaded', false);
			syncStyle(row.style, '--ft-border', null);
			syncStyle(row.style, '--ft-border-width', null);
			syncStyle(row.style, '--ft-border-strength', null);
			syncStyle(row.style, '--ft-shading-strength', null);
		}

		syncClass(row, 'ft-permanent-hidden', !settings.showHiddenItems && hidden(path) !== null);
		syncClass(row, 'ft-focus-hidden', relation === 'outside');
		syncClass(row, 'ft-focus-ancestor', relation === 'ancestor');
		syncClass(row, 'ft-focus-root', relation === 'root');
		syncClass(row, 'ft-is-bold', appearance.bold === true);
		syncClass(row, 'ft-is-strikethrough', appearance.strikethrough === true);
		const isVault = isFolder && this.nestedVaults?.isVaultRoot(path) === true;
		syncClass(row, 'ft-vault-icon', isVault && (settings.vaultMarker === 'icon' || settings.vaultMarker === 'both'));
		syncClass(row, 'ft-vault-border', isVault && (settings.vaultMarker === 'border' || settings.vaultMarker === 'both'));

		syncStyle(row.style, '--ft-text-light', appearance.text?.foregroundLight ?? null);
		syncStyle(row.style, '--ft-text-dark', appearance.text?.foregroundDark ?? null);
		syncStyle(row.style, '--ft-text-strength', appearance.text?.strength === undefined ? null : `${appearance.text.strength}%`);
		const title = row.querySelector<HTMLElement>(':scope > .nav-file-title, :scope > .nav-folder-title');
		const inset = rowInset(title);
		syncStyle(row.style, '--ft-row-inset', inset > 0 ? `${inset}px` : null);
		syncStyle(row.style, '--ft-background', appearance.background?.hex ?? null);
		const backgroundStrength = appearance.background?.strength;
		syncStyle(row.style, '--ft-background-strength', backgroundStrength === undefined ? null : `${backgroundStrength}%`);
		syncStyle(row.style, '--ft-background-hover-strength', backgroundStrength === undefined ? null : `${Math.min(100, backgroundStrength + 6)}%`);
	}

	private clearRoot(root: HTMLElement): void {
		for (const row of root.querySelectorAll<HTMLElement>('.nav-folder, .nav-file')) this.clearRow(row);
	}

	private clearRow(row: HTMLElement): void {
		for (const className of MANAGED_CLASSES) syncClass(row, className, false);
		for (const property of MANAGED_PROPERTIES) syncStyle(row.style, property, null);
	}
}
