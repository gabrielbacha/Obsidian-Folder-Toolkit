import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import globals from "globals";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "coverage/", "node_modules/", "eslint.config.mts"] },
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-non-null-assertion": "off",
			"obsidianmd/ui/sentence-case": "warn",
		},
	},
	{
		files: ["**/*.mjs"],
		languageOptions: { globals: { ...globals.node } },
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/rule-custom-message": "off",
		},
	},
	{ files: ["tests/**/*.ts"], rules: { "obsidianmd/prefer-create-el": "off" } },
]);

