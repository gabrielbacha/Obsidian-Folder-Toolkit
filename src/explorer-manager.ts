import type { App } from 'obsidian';
import { resolveAppearance } from './appearance-resolver';
import { syncClass, syncStyle } from './dom-sync';
import { focusRelation, hiddenBy } from './visibility';
import type { FolderToolkitSettings } from './types';

const MANAGED_CLASSES = [
	'ft-has-text', 'ft-has-background', 'ft-border-box', 'ft-border-rail',
	'ft-permanent-hidden', 'ft-focus-hidden', 'ft-focus-ancestor', 'ft-focus-root',
] as const;

const MANAGED_PROPERTIES = [
	'--ft-text-light', '--ft-text-dark', '--ft-background', '--ft-border',
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

	private applyRow(
		row: HTMLElement,
		path: string,
		settings: FolderToolkitSettings,
		focusPath: string | null,
	): void {
		const appearance = resolveAppearance(path, settings);
		const relation = focusRelation(path, focusPath);
		const hasText = appearance.text !== null;
		const hasBackground = appearance.background !== null;
		const hasBorder = appearance.border !== null && row.classList.contains('nav-folder') && relation !== 'ancestor';

		syncClass(row, 'ft-has-text', hasText);
		syncClass(row, 'ft-has-background', hasBackground);
		syncClass(row, 'ft-border-box', hasBorder && appearance.border?.style === 'box');
		syncClass(row, 'ft-border-rail', hasBorder && appearance.border?.style === 'rail');
		syncClass(row, 'ft-permanent-hidden', !settings.showHiddenItems && hiddenBy(path, settings.hiddenPaths) !== null);
		syncClass(row, 'ft-focus-hidden', relation === 'outside');
		syncClass(row, 'ft-focus-ancestor', relation === 'ancestor');
		syncClass(row, 'ft-focus-root', relation === 'root');

		syncStyle(row.style, '--ft-text-light', appearance.text?.foregroundLight ?? null);
		syncStyle(row.style, '--ft-text-dark', appearance.text?.foregroundDark ?? null);
		syncStyle(row.style, '--ft-background', appearance.background?.hex ?? null);
		syncStyle(row.style, '--ft-border', hasBorder ? appearance.border?.color.hex ?? null : null);
	}

	private clearRoot(root: HTMLElement): void {
		for (const row of root.querySelectorAll<HTMLElement>('.nav-folder, .nav-file')) this.clearRow(row);
	}

	private clearRow(row: HTMLElement): void {
		for (const className of MANAGED_CLASSES) syncClass(row, className, false);
		for (const property of MANAGED_PROPERTIES) syncStyle(row.style, property, null);
	}
}
