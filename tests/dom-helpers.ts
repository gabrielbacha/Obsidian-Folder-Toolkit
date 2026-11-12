export function installDomHelpers(): void {
	HTMLElement.prototype.createDiv = function (options?: string | { text?: string; cls?: string; attr?: Record<string, string> }) { return this.createEl("div", options); };
	HTMLElement.prototype.createSpan = function (options?: string | { text?: string; cls?: string; attr?: Record<string, string> }) { return this.createEl("span", options); };
	HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | { text?: string; cls?: string; attr?: Record<string, string>; type?: string; value?: string; placeholder?: string }) {
		const element = document.createElement(tag);
		if (typeof options === "string") element.className = options;
		else if (options) {
			if (options.text !== undefined) element.textContent = options.text;
			if (options.cls) element.className = options.cls;
			if (options.type) element.setAttribute("type", options.type);
			if (options.value !== undefined) (element as HTMLInputElement).value = options.value;
			if (options.placeholder) (element as HTMLInputElement).placeholder = options.placeholder;
			for (const [name, value] of Object.entries(options.attr ?? {})) element.setAttribute(name, value);
		}
		this.append(element);
		return element;
	};
	HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
	HTMLElement.prototype.removeClass = function (...classes: string[]) { this.classList.remove(...classes); };
	HTMLElement.prototype.toggleClass = function (name: string | string[], value: boolean) { for (const cls of typeof name === 'string' ? [name] : name) this.classList.toggle(cls, value); };
	HTMLElement.prototype.hasClass = function (name: string) { return this.classList.contains(name); };
	HTMLElement.prototype.empty = function () { this.replaceChildren(); };
	HTMLElement.prototype.hide = function () { this.hidden = true; };
	HTMLElement.prototype.setText = function (text: string) { this.textContent = text; };
}
