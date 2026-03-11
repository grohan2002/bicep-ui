// ---------------------------------------------------------------------------
// Tool handler implementations for the Bicep-to-Terraform conversion agent.
// Ported from bicep_converter/tools.py handler functions.
//
// Uses Node.js APIs (fs, path, child_process) — server-side only.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  RESOURCE_TYPE_MAP,
  PROPERTY_DECOMPOSITIONS,
  PROPERTY_NAME_OVERRIDES,
  extractStorageTier,
  extractStorageReplication,
} from "../mappings";

// ---------------------------------------------------------------------------
// Callbacks for side-effects the stream layer cares about
// ---------------------------------------------------------------------------

export interface ToolHandlerCallbacks {
  onTerraformOutput?: (files: Record<string, string>) => void;
  onValidation?: (passed: boolean, output: string) => void;
}

// ---------------------------------------------------------------------------
// Factory — returns a name -> handler map
// ---------------------------------------------------------------------------

export function createToolHandlers(
  callbacks?: ToolHandlerCallbacks,
): Record<string, (input: Record<string, unknown>) => Promise<string>> {
  // ------------------------------------------------------------------
  // Tool 1: read_bicep_file
  // ------------------------------------------------------------------
  async function readBicepFile(
    input: Record<string, unknown>,
  ): Promise<string> {
    const filePath = String(input.file_path ?? "");
    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
      return `Error: File not found: ${resolved}`;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return `Error: Not a file: ${resolved}`;
    }

    try {
      const content = fs.readFileSync(resolved, "utf-8");
      const lineCount = content.split("\n").length;
      const size = stat.size;
      let header = `File: ${resolved}\nSize: ${size} bytes | Lines: ${lineCount}\n`;

      if (path.extname(resolved) !== ".bicep") {
        header += `Warning: file extension is '${path.extname(resolved)}', not '.bicep'\n`;
      }

      return `${header}\n${content}`;
    } catch (err) {
      return `Error: Failed to read ${resolved}: ${String(err)}`;
    }
  }

  // ------------------------------------------------------------------
  // Tool 2: parse_bicep
  // ------------------------------------------------------------------
  async function parseBicep(
    input: Record<string, unknown>,
  ): Promise<string> {
    const content = String(input.content ?? "");

    if (!content.trim()) {
      return "Error: Empty content provided to parse_bicep.";
    }

    // No pycep equivalent in TypeScript — return the raw content with
    // section markers so the LLM can perform its own structured parsing.
    const lines = content.split("\n");
    const sections: string[] = [];
    let currentSection = "";

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("param ")) {
        if (currentSection !== "PARAMETERS") {
          currentSection = "PARAMETERS";
          sections.push("\n--- PARAMETERS ---");
        }
      } else if (trimmed.startsWith("var ")) {
        if (currentSection !== "VARIABLES") {
          currentSection = "VARIABLES";
          sections.push("\n--- VARIABLES ---");
        }
      } else if (trimmed.startsWith("resource ")) {
        if (currentSection !== "RESOURCES") {
          currentSection = "RESOURCES";
          sections.push("\n--- RESOURCES ---");
        }
      } else if (trimmed.startsWith("module ")) {
        if (currentSection !== "MODULES") {
          currentSection = "MODULES";
          sections.push("\n--- MODULES ---");
        }
      } else if (trimmed.startsWith("output ")) {
        if (currentSection !== "OUTPUTS") {
          currentSection = "OUTPUTS";
          sections.push("\n--- OUTPUTS ---");
        }
      }

      sections.push(line);
    }

    return [
      "Parsing mode: LLM-native (raw Bicep with section markers)",
      "",
      ...sections,
    ].join("\n");
  }

  // ------------------------------------------------------------------
  // Tool 3: lookup_resource_mapping
  // ------------------------------------------------------------------
  async function lookupResourceMapping(
    input: Record<string, unknown>,
  ): Promise<string> {
    const rawType = String(input.bicep_resource_type ?? "").trim();

    // Strip API version suffix
    const bicepType = rawType.includes("@")
      ? rawType.split("@")[0]
      : rawType;

    const tfType = RESOURCE_TYPE_MAP[bicepType];

    // Explicit null entry — merged into parent
    if (tfType === null && bicepType in RESOURCE_TYPE_MAP) {
      return (
        `Bicep type: ${bicepType}\n` +
        `Terraform equivalent: NONE (this resource is typically merged into ` +
        `its parent resource or has no direct Terraform equivalent).`
      );
    }

    // Not in the map at all
    if (tfType === undefined) {
      return (
        `Bicep type: ${bicepType}\n` +
        `No mapping found in the lookup table.\n` +
        `Use your knowledge of the AzureRM Terraform provider to determine ` +
        `the equivalent resource type. The general pattern is:\n` +
        `  Microsoft.<Provider>/<resourceType> -> azurerm_<snake_case_type>`
      );
    }

    const lines: string[] = [
      `Bicep type: ${bicepType}`,
      `Terraform type: ${tfType}`,
    ];

    // Check for property decompositions
    const decompositionEntries = Object.entries(PROPERTY_DECOMPOSITIONS).filter(
      ([key]) => key.startsWith(`${bicepType}::`)
    );
    if (decompositionEntries.length > 0) {
      lines.push("");
      lines.push("Property decompositions:");
      for (const [key, transforms] of decompositionEntries) {
        const propPath = key.split("::")[1];
        const tfAttrs = transforms
          .map(([attr, func]) => `${attr} (via ${func})`)
          .join(", ");
        lines.push(`  ${propPath} -> ${tfAttrs}`);
      }
    }

    // Include common property name overrides
    const overrideEntries = Object.entries(PROPERTY_NAME_OVERRIDES);
    if (overrideEntries.length > 0) {
      lines.push("");
      lines.push("Common property name overrides (camelCase -> snake_case):");
      for (const [bicepProp, tfProp] of overrideEntries.slice(0, 10)) {
        lines.push(`  ${bicepProp} -> ${tfProp}`);
      }
    }

    return lines.join("\n");
  }

  // ------------------------------------------------------------------
  // Tool 4: generate_terraform
  // ------------------------------------------------------------------
  async function generateTerraform(
    input: Record<string, unknown>,
  ): Promise<string> {
    const blockType = String(input.block_type ?? "").trim().toLowerCase();
    const blockName = String(input.block_name ?? "").trim();
    const hclBody = String(input.hcl_body ?? "").trim();

    const validTypes = new Set([
      "resource",
      "variable",
      "locals",
      "output",
      "provider",
      "module",
      "data",
      "terraform",
    ]);

    if (!validTypes.has(blockType)) {
      return `Error: Invalid block_type '${blockType}'. Must be one of: ${[...validTypes].sort().join(", ")}`;
    }

    // Indent the body
    const indentedBody = hclBody
      .split("\n")
      .map((line) => (line.trim() ? `  ${line}` : ""))
      .join("\n");

    let hcl: string;

    if (blockType === "resource" || blockType === "data") {
      const parts = blockName.split(".", 2);
      if (parts.length === 2) {
        hcl = `${blockType} "${parts[0]}" "${parts[1]}" {\n${indentedBody}\n}`;
      } else {
        hcl = `${blockType} "${blockName}" {\n${indentedBody}\n}`;
      }
    } else if (
      blockType === "variable" ||
      blockType === "output" ||
      blockType === "module" ||
      blockType === "provider"
    ) {
      hcl = `${blockType} "${blockName}" {\n${indentedBody}\n}`;
    } else if (blockType === "locals") {
      hcl = `locals {\n${indentedBody}\n}`;
    } else if (blockType === "terraform") {
      hcl = `terraform {\n${indentedBody}\n}`;
    } else {
      hcl = `${blockType} "${blockName}" {\n${indentedBody}\n}`;
    }

    return hcl;
  }

  // ------------------------------------------------------------------
  // Tool 5: write_terraform_files
  // ------------------------------------------------------------------
  async function writeTerraformFiles(
    input: Record<string, unknown>,
  ): Promise<string> {
    const outputDir = path.resolve(String(input.output_dir ?? ""));

    let files: Record<string, string>;
    try {
      files = JSON.parse(String(input.files ?? "{}"));
    } catch (err) {
      return `Error: Invalid JSON in 'files' parameter: ${String(err)}`;
    }

    if (typeof files !== "object" || files === null || Array.isArray(files)) {
      return "Error: 'files' must be a JSON object mapping filename -> content";
    }

    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      return `Error: Failed to create output directory: ${String(err)}`;
    }

    const written: string[] = [];
    for (const [filename, content] of Object.entries(files)) {
      if (!filename.endsWith(".tf")) {
        written.push(`  Warning: ${filename} does not end with .tf`);
      }

      const filePath = path.join(outputDir, filename);
      try {
        fs.writeFileSync(filePath, content, "utf-8");
        const size = fs.statSync(filePath).size;
        written.push(`  ${filename} (${size} bytes)`);
      } catch (err) {
        return `Error: Failed to write ${filename}: ${String(err)}`;
      }
    }

    // Fire callback so the stream can emit terraform_output
    callbacks?.onTerraformOutput?.(files);

    return [
      `Output directory: ${outputDir}`,
      `Files written (${Object.keys(files).length}):`,
      ...written,
    ].join("\n");
  }

  // ------------------------------------------------------------------
  // Tool 6: validate_terraform
  // ------------------------------------------------------------------
  async function validateTerraform(
    input: Record<string, unknown>,
  ): Promise<string> {
    const workingDir = path.resolve(String(input.working_dir ?? ""));

    if (!fs.existsSync(workingDir) || !fs.statSync(workingDir).isDirectory()) {
      return `Error: Directory not found: ${workingDir}`;
    }

    // Find the CLI binary — prefer tofu, fall back to terraform
    let cli: string | null = null;
    try {
      execSync("which tofu", { stdio: "pipe" });
      cli = "tofu";
    } catch {
      try {
        execSync("which terraform", { stdio: "pipe" });
        cli = "terraform";
      } catch {
        // Neither found
      }
    }

    if (!cli) {
      return (
        "Error: Neither 'tofu' nor 'terraform' found in PATH. " +
        "Install OpenTofu (https://opentofu.org) or Terraform to enable validation."
      );
    }

    const results: string[] = [`Using: ${cli}`];
    let validationPassed = false;

    // Run init
    try {
      const initOutput = execSync(`${cli} init -backend=false`, {
        cwd: workingDir,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      results.push(`\n--- ${cli} init ---`);
      if (initOutput) results.push(initOutput);
    } catch (err: unknown) {
      results.push(`\n--- ${cli} init ---`);
      const execErr = err as { stdout?: string; stderr?: string; status?: number };
      if (execErr.stdout) results.push(execErr.stdout);
      if (execErr.stderr) results.push(execErr.stderr);
      results.push(`\n${cli} init failed (exit code ${execErr.status ?? "unknown"})`);

      const output = results.join("\n");
      callbacks?.onValidation?.(false, output);
      return output;
    }

    // Run validate
    try {
      const validateOutput = execSync(`${cli} validate`, {
        cwd: workingDir,
        timeout: 60_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      results.push(`\n--- ${cli} validate ---`);
      if (validateOutput) results.push(validateOutput);
      results.push("\nValidation PASSED");
      validationPassed = true;
    } catch (err: unknown) {
      results.push(`\n--- ${cli} validate ---`);
      const execErr = err as { stdout?: string; stderr?: string; status?: number };
      if (execErr.stdout) results.push(execErr.stdout);
      if (execErr.stderr) results.push(execErr.stderr);
      results.push(`\nValidation FAILED (exit code ${execErr.status ?? "unknown"})`);
      validationPassed = false;
    }

    const output = results.join("\n");
    callbacks?.onValidation?.(validationPassed, output);
    return output;
  }

  // ------------------------------------------------------------------
  // Tool 7: list_bicep_files
  // ------------------------------------------------------------------
  async function listBicepFiles(
    input: Record<string, unknown>,
  ): Promise<string> {
    const directory = path.resolve(String(input.directory ?? ""));
    const recursive =
      String(input.recursive ?? "false").trim().toLowerCase() === "true";

    if (
      !fs.existsSync(directory) ||
      !fs.statSync(directory).isDirectory()
    ) {
      return `Error: Directory not found: ${directory}`;
    }

    const bicepFiles: { rel: string; size: number }[] = [];

    function scanDir(dir: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && recursive) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".bicep")) {
          const size = fs.statSync(fullPath).size;
          const rel = path.relative(directory, fullPath);
          bicepFiles.push({ rel, size });
        }
      }
    }

    scanDir(directory);
    bicepFiles.sort((a, b) => a.rel.localeCompare(b.rel));

    if (bicepFiles.length === 0) {
      return `No .bicep files found in ${directory}`;
    }

    const lines = [
      `Directory: ${directory}`,
      `Recursive: ${recursive}`,
      "",
    ];
    for (const f of bicepFiles) {
      lines.push(`  ${f.rel} (${f.size} bytes)`);
    }
    lines.push(`\nTotal: ${bicepFiles.length} .bicep file(s)`);

    return lines.join("\n");
  }

  // ------------------------------------------------------------------
  // Return the handler map
  // ------------------------------------------------------------------
  return {
    read_bicep_file: readBicepFile,
    parse_bicep: parseBicep,
    lookup_resource_mapping: lookupResourceMapping,
    generate_terraform: generateTerraform,
    write_terraform_files: writeTerraformFiles,
    validate_terraform: validateTerraform,
    list_bicep_files: listBicepFiles,
  };
}
