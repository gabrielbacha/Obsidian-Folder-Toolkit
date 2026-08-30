# Folder Toolkit development

- Target: public, mobile-compatible Obsidian Community Plugin written in strict TypeScript.
- Keep `src/main.ts` focused on lifecycle and coordination; keep explorer DOM work in `explorer-manager.ts`.
- Use public Obsidian APIs and path-bearing explorer DOM attributes. Do not depend on private `fileItems` maps.
- Never modify note content or frontmatter.
- Register and clean up every workspace event, observer, class, and style.
- Preserve command IDs, settings schema, palette slot semantics, and plugin ID after release.
- Run `npm run check` and verify `main.js`, `manifest.json`, and `styles.css` at the plugin root.

