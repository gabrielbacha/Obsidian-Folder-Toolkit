import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFolder } from "obsidian";
import type FolderToolkitPlugin from "../src/main";
import type { AppearanceRule, FolderToolkitSettings } from "../src/types";
import { AppearanceModal } from "../src/ui/appearance-modal";

function installDomHelpers(): void {
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
	HTMLElement.prototype.empty = function () { this.replaceChildren(); };
	HTMLElement.prototype.hide = function () { this.hidden = true; };
	HTMLElement.prototype.setText = function (text: string) { this.textContent = text; };
}

function harness(folder: boolean) {
	const settings: FolderToolkitSettings = {
		schemaVersion: 6,
		paletteTemplateId: "default",
		tabStyle: "off",
		appearanceRules: {},
		conditionalFormats: [],
		hiddenPaths: [],
		showHiddenItems: false,
	};
	const previewAppearance = vi.fn();
	const toolkit = {
		app: { vault: { getAbstractFileByPath: () => folder ? new TFolder() : {} } },
		settings,
		previewAppearance,
		clearAppearancePreview: vi.fn(),
		setAppearance: vi.fn().mockResolvedValue(undefined),
	} as unknown as FolderToolkitPlugin;
	const modal = new AppearanceModal(toolkit, folder ? "Folder" : "note.md");
	modal.onOpen();
	const latestDraft = (): AppearanceRule => previewAppearance.mock.calls.at(-1)?.[1] as AppearanceRule;
	return { modal, latestDraft };
}

describe("AppearanceModal immediate controls", () => {
	beforeEach(() => {
		document.body.replaceChildren();
		installDomHelpers();
	});

	it("uses a compact file layout and applies text options without an enable gate", () => {
		const { modal, latestDraft } = harness(false);
		expect(modal.contentEl.classList.contains("ft-appearance-modal--file")).toBe(true);
		expect(modal.contentEl.textContent).not.toContain("Override text");
		const headings = [...modal.contentEl.querySelectorAll(".ft-color-card h3")].map((heading) => heading.textContent);
		expect(headings).toEqual(["Background", "Border", "Text"]);
		const textCard = modal.contentEl.querySelector<HTMLElement>(".ft-color-card--text")!;
		expect([...textCard.querySelectorAll<HTMLButtonElement>(".ft-swatch")].every((button) => !button.disabled)).toBe(true);
		textCard.querySelector<HTMLButtonElement>("button[aria-label=Bold]")!.click();
		expect(latestDraft().text?.bold).toBe(true);

		modal.contentEl.querySelector<HTMLElement>(".ft-color-card--text")!.querySelector<HTMLButtonElement>(".ft-swatch")!.click();
		expect(latestDraft().text?.color).toEqual({ kind: "preset", slot: 0 });
		const refreshedText = modal.contentEl.querySelector<HTMLElement>(".ft-color-card--text")!;
		[...refreshedText.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Clear color")!.click();
		expect(latestDraft().text?.color).toBeUndefined();
		expect(latestDraft().text?.bold).toBe(true);
		modal.onClose();
	});

	it("applies, clears, and explicitly blocks a file border", () => {
		const { modal, latestDraft } = harness(false);
		const borderCard = () => [...modal.contentEl.querySelectorAll<HTMLElement>(".ft-color-card")].find((card) => card.querySelector("h3")?.textContent === "Border")!;
		[...borderCard().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Vertical rail")!.click();
		expect(latestDraft().border).toMatchObject({ style: "rail", color: { kind: "preset", slot: 0 }, thickness: "thin" });
		expect(modal.contentEl.querySelector(".ft-preview-tree .nav-file.ft-preview-border-rail")).not.toBeNull();
		[...borderCard().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Clear border")!.click();
		expect(latestDraft().border).toBeUndefined();
		[...borderCard().querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "No border")!.click();
		expect(latestDraft().border).toEqual({ kind: "none" });
		modal.onClose();
	});

	it("keeps descendant controls active and activates folder treatments on first click", () => {
		const { modal, latestDraft } = harness(true);
		const cascades = [...modal.contentEl.querySelectorAll<HTMLInputElement>(".ft-cascade-control input")];
		expect(cascades).toHaveLength(2);
		expect(cascades.every((checkbox) => !checkbox.disabled)).toBe(true);
		cascades[0].checked = false;
		cascades[0].dispatchEvent(new Event("change"));
		modal.contentEl.querySelector<HTMLElement>(".ft-color-card--background")!.querySelector<HTMLButtonElement>(".ft-swatch")!.click();
		expect(latestDraft().background?.cascade).toBe(false);

		const borderCard = [...modal.contentEl.querySelectorAll<HTMLElement>(".ft-color-card")].find((card) => card.querySelector("h3")?.textContent === "Border")!;
		[...borderCard.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Rounded box")!.click();
		expect(latestDraft().border).toMatchObject({ style: "box", color: { kind: "preset", slot: 0 } });
		modal.onClose();
	});
});
