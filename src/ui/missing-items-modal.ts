import { Modal, setIcon, type App } from 'obsidian';
import type { MissingRoot } from '../rule-transfer';
import { ConfirmRemoveModal } from './confirm-remove-modal';
import { ReattachModal } from './reattach-modal';

/** The plugin methods that the missing items list uses. */
export interface MissingItemsHost {
	app: App;
	missingAppearanceRoots(): MissingRoot[];
	reattachAppearance(oldPath: string, newPath: string): Promise<void>;
	removeAppearanceUnder(path: string): Promise<void>;
}

export const MISSING_ITEMS_HINT = 'These rules belong to items that were moved, renamed, or deleted outside Obsidian. Reattach them to the item in its new place, or remove them.';

/**
 * Renders one card per missing item, with Reattach and Remove. Each card holds the
 * topmost missing path; reattaching it moves the rules below it as well.
 * `onChange` runs after a rule was moved or removed.
 */
export function renderMissingItemCards(container: HTMLElement, host: MissingItemsHost, roots: readonly MissingRoot[], onChange: () => void): void {
	for (const root of roots) {
		const card = container.createDiv('ft-rule-card ft-rule-card--missing');
		const identity = card.createDiv('ft-rule-card__identity');
		const parts = root.path.split('/');
		const name = parts.pop() ?? root.path;
		identity.createDiv({ text: name, cls: 'ft-rule-card__name' });
		const count = root.count === 1 ? '1 rule' : `${root.count} rules`;
		identity.createDiv({ text: `${parts.join('/') || 'Vault root'} · ${count}`, cls: 'ft-rule-card__path' });
		const actions = card.createDiv('ft-rule-card__actions');
		const reattach = actions.createEl('button', { text: 'Reattach…', cls: 'mod-cta', attr: { type: 'button', 'aria-label': `Reattach appearance of ${name}` } });
		reattach.addEventListener('click', () => {
			new ReattachModal(host.app, root.path, (item) => {
				void host.reattachAppearance(root.path, item.path).then(onChange);
			}).open();
		});
		const remove = actions.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': `Remove missing rules for ${name}` } });
		setIcon(remove, 'trash-2');
		remove.addEventListener('click', () => {
			new ConfirmRemoveModal(host.app, root.path, async () => {
				await host.removeAppearanceUnder(root.path);
				onChange();
			}, {
				title: root.count === 1 ? 'Remove missing rule?' : `Remove ${root.count} missing rules?`,
				description: 'This removes the saved appearance of this missing item and of the items that were inside it.',
				confirmLabel: 'Remove',
			}).open();
		});
	}
}

/** Dialog opened by the "Relink missing items" command. */
export class MissingItemsModal extends Modal {
	constructor(private readonly host: MissingItemsHost) {
		super(host.app);
	}

	onOpen(): void {
		this.setTitle('Missing items');
		this.contentEl.addClass('ft-missing-modal');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		const roots = this.host.missingAppearanceRoots();
		if (roots.length === 0) {
			this.contentEl.createEl('p', { text: 'No missing items. Every appearance rule belongs to a file or folder that exists.' });
			this.contentEl.createEl('p', {
				text: 'A rule appears here when its item is moved outside Obsidian. If a color is gone but nothing is listed, another device removed the rule. Set the color again.',
				cls: 'ft-card-hint',
			});
		} else {
			this.contentEl.createEl('p', { text: MISSING_ITEMS_HINT, cls: 'ft-card-hint' });
			renderMissingItemCards(this.contentEl.createDiv('ft-missing-modal__list'), this.host, roots, () => this.render());
		}
		const actions = this.contentEl.createDiv('ft-confirm-modal__actions');
		const close = actions.createEl('button', { text: 'Close', attr: { type: 'button' } });
		close.addEventListener('click', () => this.close());
	}
}
