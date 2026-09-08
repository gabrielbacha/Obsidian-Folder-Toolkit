import type { App } from 'obsidian';
import { hasDirectColor, resolveAppearance } from './appearance-resolver';
import { conditionalEffectFor } from './conditional-format';
import { syncClass, syncStyle } from './dom-sync';
import { focusRelation, hiddenBy } from './visibility';
import type { FolderToolkitSettings } from './types';

const MANAGED_CLASSES = [
	'ft-has-text', 'ft-has-background', 'ft-background-direct', 'ft-background-cascade',
	'ft-background-block', 'ft-background-block-cascade', 'ft-border-box', 'ft-border-rail',
	'ft-border-shaded', 'ft-direct-color-rule',
	'ft-permanent-hidden', 'ft-focus-hidden', 'ft-focus-ancestor', 'ft-focus-root',
] as const;

const MANAGED_PROPERTIES = [
	'--ft-text-light', '--ft-text-dark', '--ft-background', '--ft-border', '--ft-border-width',
	'--ft-text-strength', '--ft-background-strength', '--ft-background-hover-strength', '--ft-border-strength',
] as const;

function isHtmlElement(element: Element): element is HTMLElement {
	return 'style' in element && 'dataset' in element;
}

export class ExplorerManager {
	private readonly observers = new Map<HTMLElement, MutationObserver>();
	private frame: number | null = null;

	constructor(
		private readonly app: App,
		private readonly getSettings: () => FolderToolkitSettings,
		private readonly getFocusPath: () => string | null,
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
			const observer = new Observer(() => this.reconcileSoon());
			observer.observe(root, { childList: true, subtree: true });
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
		for (const root of this.observers.keys()) {
			const rows = new Map<HTMLElement, string>();
			for (const pathElement of root.querySelectorAll<HTMLElement>('[data-path]')) {
				const path = pathElement.dataset.path;
				const row = pathElement.closest('.nav-folder, .nav-file');
				if (path && row && isHtmlElement(row)) rows.set(row, path);
			}
			for (const [row, path] of rows) this.applyRow(row, path, settings, focusPath);
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

	private getVisibleFolderIndex(row: HTMLElement): number {
		const siblings = row.parentElement?.children;
		if (!siblings) return 0;
		let folderIndex = 0;
		for (const sibling of siblings) {
			if (!isHtmlElement(sibling) || !sibling.classList.contains('nav-folder')) continue;
			if (sibling === row) return folderIndex;
			folderIndex += 1;
		}
		return 0;
	}

	private applyRow(
		row: HTMLElement,
		path: string,
		settings: FolderToolkitSettings,
		focusPath: string | null,
	): void {
		const isFolder = row.classList.contains('nav-folder');
		const context = {
			settings,
			getDescendantIndex: () => this.getVisibleFolderIndex(row),
			isFolder,
		};
		const appearance = resolveAppearance(path, context);
		const relation = focusRelation(path, focusPath);
		const hasText = appearance.text !== null;
		const hasBackground = appearance.background !== null;
		const directBackground = settings.appearanceRules[path]?.background
			?? conditionalEffectFor(path, isFolder, 'background', settings);
		const hasDirectBackground = directBackground !== undefined;
		const directBackgroundHasColor = hasDirectBackground && directBackground.choice.kind !== 'none';
		const directBackgroundBlocks = hasDirectBackground && directBackground.choice.kind === 'none';
		const directBackgroundCascades = isFolder && directBackground?.cascade === true;

		syncClass(row, 'ft-direct-color-rule', hasDirectColor(settings.appearanceRules[path]));
		syncClass(row, 'ft-has-text', hasText);
		syncClass(row, 'ft-has-background', hasBackground);
		syncClass(row, 'ft-background-direct', directBackgroundHasColor);
		syncClass(row, 'ft-background-cascade', directBackgroundHasColor && directBackgroundCascades);
		syncClass(row, 'ft-background-block', directBackgroundBlocks);
		syncClass(row, 'ft-background-block-cascade', directBackgroundBlocks && directBackgroundCascades);

		if (appearance.border && row.classList.contains('nav-folder') && relation !== 'ancestor') {
			syncClass(row, 'ft-border-box', appearance.border.style === 'box');
			syncClass(row, 'ft-border-rail', appearance.border.style === 'rail');
			syncStyle(row.style, '--ft-border', appearance.border.color.hex);
			syncStyle(row.style, '--ft-border-strength', appearance.border.color.strength === undefined ? null : `${appearance.border.color.strength}%`);
			
			const thicknessMap = appearance.border.style === 'box'
				? { thin: '1px', medium: '2px', thick: '3px' }
				: { thin: '2px', medium: '4px', thick: '6px' };
			const width = thicknessMap[appearance.border.thickness ?? 'thin'];
			syncStyle(row.style, '--ft-border-width', width);

			syncClass(row, 'ft-border-shaded', !!appearance.border.shading);
		} else {
			syncClass(row, 'ft-border-box', false);
			syncClass(row, 'ft-border-rail', false);
			syncClass(row, 'ft-border-shaded', false);
			syncStyle(row.style, '--ft-border', null);
			syncStyle(row.style, '--ft-border-width', null);
			syncStyle(row.style, '--ft-border-strength', null);
		}

		syncClass(row, 'ft-permanent-hidden', !settings.showHiddenItems && hiddenBy(path, settings.hiddenPaths) !== null);
		syncClass(row, 'ft-focus-hidden', relation === 'outside');
		syncClass(row, 'ft-focus-ancestor', relation === 'ancestor');
		syncClass(row, 'ft-focus-root', relation === 'root');

		syncStyle(row.style, '--ft-text-light', appearance.text?.foregroundLight ?? null);
		syncStyle(row.style, '--ft-text-dark', appearance.text?.foregroundDark ?? null);
		syncStyle(row.style, '--ft-text-strength', appearance.text?.strength === undefined ? null : `${appearance.text.strength}%`);
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
