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
if (errors.length > 0) {
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}
console.log(`Release ${manifest.version} is valid.`);

