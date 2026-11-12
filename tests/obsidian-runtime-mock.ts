export class Scope {
	constructor(public parent?: Scope) {}
	register(_modifiers: unknown, _key: unknown, callback: () => unknown): unknown { return callback; }
}
export class Menu {}
export class Modal {
	closed = true;
	contentEl = document.createElement('div');
	setTitle(): void {}
	open(): void { if (!this.closed) return; this.closed = false; (this as { onOpen?: () => void }).onOpen?.(); }
	close(): void { this.closed = true; (this as { onClose?: () => void }).onClose?.(); }
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
