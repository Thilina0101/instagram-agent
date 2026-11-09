#!/usr/bin/env node
/**
 * Installs the Instagram skill for Claude Code (in your user folder, so it works in every project):
 *   node install-skill.mjs            → ~/.claude/skills/instagram/SKILL.md
 *   node install-skill.mjs --remove   → removes it
 * The skill calls ig.mjs in this folder, so keep this folder where it is (or install again after moving it).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(os.homedir(), ".claude", "skills", "instagram");

if (process.argv.includes("--remove")) {
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
  process.exit(0);
}

const slash = (p) => p.split(path.sep).join("/");
const skill = fs.readFileSync(path.join(HERE, "skill", "instagram", "SKILL.md"), "utf8")
  .replaceAll("{{IG}}", slash(path.join(HERE, "ig.mjs")))
  .replaceAll("{{BRAND}}", slash(path.join(HERE, "business", "knowledge", "brand.md")));
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, "SKILL.md"), skill);
console.log(`Installed the Instagram skill: ${path.join(target, "SKILL.md")}
Restart Claude Code, then ask e.g. "answer the new Instagram comments" or type /instagram.`);
