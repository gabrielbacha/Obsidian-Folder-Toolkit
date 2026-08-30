import type { App } from 'obsidian';
import { resolveAppearance } from './appearance-resolver';
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
		this.clearRow(row);
		const appearance = resolveAppearance(path, settings);
		if (appearance.text) {
			row.addClass('ft-has-text');
			row.style.setProperty('--ft-text-light', appearance.text.foregroundLight);
			row.style.setProperty('--ft-text-dark', appearance.text.foregroundDark);
		}
		if (appearance.background) {
			row.addClass('ft-has-background');
			row.style.setProperty('--ft-background', appearance.background.hex);
		}
		if (appearance.border && row.hasClass('nav-folder')) {
			row.addClass(appearance.border.style === 'box' ? 'ft-border-box' : 'ft-border-rail');
			row.style.setProperty('--ft-border', appearance.border.color.hex);
		}

		if (!settings.showHiddenItems && hiddenBy(path, settings.hiddenPaths)) {
			row.addClass('ft-permanent-hidden');
		}

		const relation = focusRelation(path, focusPath);
		row.toggleClass('ft-focus-hidden', relation === 'outside');
		row.toggleClass('ft-focus-ancestor', relation === 'ancestor');
		row.toggleClass('ft-focus-root', relation === 'root');
		if (relation === 'ancestor') {
			row.removeClass('ft-border-box', 'ft-border-rail');
			row.style.removeProperty('--ft-border');
		}
	}

	private clearRoot(root: HTMLElement): void {
		for (const row of root.querySelectorAll<HTMLElement>('.nav-folder, .nav-file')) this.clearRow(row);
	}

	private clearRow(row: HTMLElement): void {
		row.removeClass(...MANAGED_CLASSES);
		for (const property of MANAGED_PROPERTIES) row.style.removeProperty(property);
	}
}
