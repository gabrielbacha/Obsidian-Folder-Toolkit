export class Menu {}
export class Modal {
	contentEl = document.createElement('div');
	setTitle(): void {}
	open(): void { (this as { onOpen?: () => void }).onOpen?.(); }
	close(): void { (this as { onClose?: () => void }).onClose?.(); }
}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class TAbstractFile {}
export class TFolder extends TAbstractFile {}
export function setIcon(): void {}
