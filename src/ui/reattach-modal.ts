import { FuzzySuggestModal, TFolder, type App, type TAbstractFile } from 'obsidian';

/** Lets the user pick the file or folder that a missing appearance rule now belongs to. */
export class ReattachModal extends FuzzySuggestModal<TAbstractFile> {
	constructor(
		app: App,
		private readonly missingPath: string,
		private readonly onPick: (item: TAbstractFile) => void,
	) {
		super(app);
		this.setPlaceholder(`New location of ${missingPath}`);
		this.setInstructions([
			{ command: '↵', purpose: 'move the appearance here' },
			{ command: 'esc', purpose: 'cancel' },
		]);
	}

	onOpen(): void {
		void super.onOpen();
		// Start with the old name, so a moved or copied item with the same name is at the top.
		this.inputEl.value = this.missingPath.split('/').at(-1) ?? '';
		this.inputEl.dispatchEvent(new Event('input'));
	}

	getItems(): TAbstractFile[] {
		return this.app.vault.getAllLoadedFiles().filter((item) => item.path !== '/' && item.path !== '');
	}

	getItemText(item: TAbstractFile): string {
		return item instanceof TFolder ? `${item.path}/` : item.path;
	}

	onChooseItem(item: TAbstractFile): void {
		this.onPick(item);
	}
}
