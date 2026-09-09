import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceControlRenderer } from "../src/ui/appearance-controls";
import type FolderToolkitPlugin from "../src/main";

function installDomHelpers(): void {
	HTMLElement.prototype.createDiv = function (options?: string | { text?: string; cls?: string; attr?: Record<string, string> }) {
		return this.createEl("div", options);
	};
	HTMLElement.prototype.createSpan = function (options?: string | { text?: string; cls?: string; attr?: Record<string, string> }) {
		return this.createEl("span", options);
	};
	HTMLElement.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | { text?: string; cls?: string; attr?: Record<string, string>; type?: string; value?: string; placeholder?: string }) {
		const element = document.createElement(tag);
		if (typeof options === "string") element.className = options;
		else if (options) {
			if (options.text !== undefined) element.textContent = options.text;
			if (options.cls) element.className = options.cls;
			if (options.type) element.setAttribute("type", options.type);
			if (options.value) (element as HTMLInputElement).value = options.value;
			if (options.placeholder) (element as HTMLInputElement).placeholder = options.placeholder;
			for (const [name, value] of Object.entries(options.attr ?? {})) element.setAttribute(name, value);
		}
		this.append(element);
		return element;
	};
	HTMLElement.prototype.addClass = function (...classes: string[]) { this.classList.add(...classes); };
}

function toolkit(): FolderToolkitPlugin {
	return { settings: { paletteTemplateId: "default" } } as FolderToolkitPlugin;
}

describe("AppearanceControlRenderer", () => {
	beforeEach(() => installDomHelpers());

	it("exposes pressed typography state and keyboard-native buttons", () => {
		const host = document.createElement("div");
		const onChange = vi.fn();
		new AppearanceControlRenderer(toolkit()).renderTypography(host, true, false, onChange);
		const [bold, strike] = [...host.querySelectorAll<HTMLButtonElement>("button")];
		expect(bold?.getAttribute("aria-pressed")).toBe("true");
		expect(strike?.getAttribute("aria-pressed")).toBe("false");
		strike?.click();
		expect(onChange).toHaveBeenCalledWith(true, true);
	});

	it("keeps an existing custom picker compact until requested and validates hex beside it", () => {
		const host = document.createElement("div");
		const onSelect = vi.fn();
		const controls = new AppearanceControlRenderer(toolkit());
		controls.renderColorControls(host, {
			selected: { kind: "custom", hex: "#C8C8C8", strength: 100 },
			defaultStrength: 100,
			onSelect,
		});
		const trigger = host.querySelector<HTMLButtonElement>(".ft-custom-trigger")!;
		const popover = host.querySelector<HTMLElement>(".ft-custom-popover")!;
		expect(popover.hidden).toBe(true);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		trigger.click();
		expect(popover.hidden).toBe(false);
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		const field = host.querySelector<HTMLInputElement>("input[type=text]")!;
		field.value = "nope";
		field.dispatchEvent(new Event("input"));
		expect(field.hasAttribute("aria-invalid")).toBe(true);
		expect(host.querySelector(".ft-field-error")?.classList.contains("is-visible")).toBe(true);
		controls.dispose();
	});

	it("keeps custom color active when strength changes after a palette selection", () => {
		const host = document.createElement("div");
		const onSelect = vi.fn();
		new AppearanceControlRenderer(toolkit()).renderColorControls(host, {
			selected: { kind: "preset", slot: 2, strength: 40 },
			defaultStrength: 100,
			onSelect,
		});
		host.querySelector<HTMLButtonElement>(".ft-custom-trigger")!.click();
		const field = host.querySelector<HTMLInputElement>("input[type=text]")!;
		field.value = "#123456";
		field.dispatchEvent(new Event("input"));
		expect(host.querySelector(".ft-swatch.is-selected")).toBeNull();
		const slider = host.querySelector<HTMLInputElement>("input[type=range]")!;
		slider.value = "50";
		slider.dispatchEvent(new Event("input"));
		expect(onSelect).toHaveBeenLastCalledWith({ kind: "custom", hex: "#123456", strength: 50 }, false);
	});

});
