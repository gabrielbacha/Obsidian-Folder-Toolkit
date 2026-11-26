import { Modal, type App } from 'obsidian';

/** Asks for a preset name. Used to save a new preset and to rename one. */
export class PresetNameModal extends Modal {
	constructor(
		app: App,
		private readonly options: {
			title: string;
			initialName?: string;
			submitLabel?: string;
			onSubmit: (name: string) => Promise<void> | void;
		},
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.options.title);
		this.contentEl.empty();
		this.contentEl.addClass('ft-preset-name-modal');
		const form = this.contentEl.createEl('form', { cls: 'ft-preset-name-form' });
		const input = form.createEl('input', {
			cls: 'ft-preset-name-input',
			attr: { type: 'text', placeholder: 'Preset name', 'aria-label': 'Preset name', maxlength: '80' },
		});
		input.value = this.options.initialName ?? '';
		const error = form.createDiv({ cls: 'ft-field-error', attr: { role: 'status' } });
		const buttons = form.createDiv('ft-preset-name-buttons');
		const cancel = buttons.createEl('button', { text: 'Cancel', attr: { type: 'button' } });
		cancel.addEventListener('click', () => this.close());
		const submit = buttons.createEl('button', { text: this.options.submitLabel ?? 'Save', cls: 'mod-cta', attr: { type: 'submit' } });
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			const name = input.value.trim();
			if (!name) {
				error.setText('Enter a name.');
				error.addClass('is-visible');
				input.focus();
				return;
			}
			submit.disabled = true;
			void Promise.resolve(this.options.onSubmit(name)).then(
				() => this.close(),
				(failure: unknown) => {
					submit.disabled = false;
					error.setText(failure instanceof Error ? failure.message : 'The preset could not be saved.');
					error.addClass('is-visible');
				},
			);
		});
		window.setTimeout(() => { input.focus(); input.select(); }, 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
