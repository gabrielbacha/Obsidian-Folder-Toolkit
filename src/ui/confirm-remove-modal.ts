import { Modal, type App } from 'obsidian';

export class ConfirmRemoveModal extends Modal {
	constructor(
		app: App,
		private readonly path: string,
		private readonly onConfirm: () => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle('Remove color rule?');
		this.contentEl.addClass('ft-confirm-modal');
		this.contentEl.createEl('p', { text: 'This removes the saved color rule. The file or folder itself is not changed.' });
		this.contentEl.createDiv({ text: this.path, cls: 'ft-confirm-modal__path' });
		const error = this.contentEl.createDiv({ cls: 'ft-field-error', attr: { role: 'status' } });
		const actions = this.contentEl.createDiv('ft-confirm-modal__actions');
		const cancel = actions.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		const remove = actions.createEl('button', { text: 'Remove rule', cls: 'mod-warning', attr: { type: 'button' } });
		remove.addEventListener('click', () => { void this.remove(remove, cancel, error); });
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async remove(remove: HTMLButtonElement, cancel: HTMLButtonElement, error: HTMLElement): Promise<void> {
		remove.disabled = true;
		cancel.disabled = true;
		try {
			await this.onConfirm();
			this.close();
		} catch {
			error.setText('The rule could not be removed. Try again.');
			error.addClass('is-visible');
			remove.disabled = false;
			cancel.disabled = false;
		}
	}
}
