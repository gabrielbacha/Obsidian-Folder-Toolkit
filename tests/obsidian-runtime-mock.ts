export class Menu {}
export class Modal {
	contentEl = document.createElement('div');
	setTitle(): void {}
	open(): void { (this as { onOpen?: () => void }).onOpen?.(); }
	close(): void { (this as { onClose?: () => void }).onClose?.(); }
}
export class FuzzySuggestModal {
	inputEl = document.createElement('input');
	constructor(public app: unknown) {}
	setPlaceholder(): void {}
	setInstructions(): void {}
	onOpen(): void {}
	open(): void { this.onOpen(); }
}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class TAbstractFile {}
export class TFolder extends TAbstractFile {}
export function setIcon(): void {}
