import { existsSync, readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const errors = [];
if (manifest.id !== "folder-toolkit") errors.push("manifest id must remain folder-toolkit");
if (manifest.version !== packageJson.version) errors.push("manifest and package versions differ");
if (versions[manifest.version] !== manifest.minAppVersion) errors.push("versions.json does not match manifest");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push("version must be x.y.z");
for (const file of ["main.js", "manifest.json", "styles.css", "README.md", "LICENSE"]) {
	if (!existsSync(file)) errors.push(`missing release/repository file: ${file}`);
}
const strengths = JSON.parse(readFileSync("src/appearance-tokens.json", "utf8"));
const stylesheet = readFileSync("styles.css", "utf8");
for (const key of ["text", "background", "box", "rail"]) {
	const value = strengths[key];
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) errors.push(`invalid shared strength: ${key}`);
	if (!stylesheet.includes(`--ft-default-${key}-strength: ${value}%;`)) errors.push(`CSS default does not match its source: ${key}`);
}
if (errors.length > 0) {
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}
console.log(`Release ${manifest.version} is valid.`);

