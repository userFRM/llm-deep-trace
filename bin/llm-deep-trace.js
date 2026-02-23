#!/usr/bin/env node
"use strict";
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const pkgDir = path.join(__dirname, "..");
const nextDir = path.join(pkgDir, ".next");
const port = process.env.PORT || "8340";
const host = process.env.HOST || "0.0.0.0";

if (!fs.existsSync(nextDir)) {
  console.log("llm-deep-trace: first run — building (this takes ~30s)...");
  execSync("npx next build", { cwd: pkgDir, stdio: "inherit" });
}

const child = spawn(
  "npx",
  ["next", "start", "--hostname", host, "--port", port],
  { cwd: pkgDir, stdio: "inherit" }
);
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
