// ---------------------------------------------------------------------------
// Tool handlers for the CloudFormation-to-Terraform conversion agent.
//
// Provides the 3 CF-specific handlers (read_cf_template, parse_cloudformation,
// lookup_cf_resource_mapping) and merges them with the shared HCL-output
// handlers (generate_terraform, write_terraform_files, format_terraform,
// validate_terraform) created by lib/agent/tool-handlers.ts — those four
// are provider-agnostic and identical regardless of source format.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

import {
  createToolHandlers,
  type ToolHandlerCallbacks,
} from "../agent/tool-handlers";
import { ok, err, type ToolResult } from "../tool-result";
import { CF_RESOURCE_TYPE_MAP } from "../cf-mappings";

// ---------------------------------------------------------------------------
// Path safety (mirrors lib/agent/tool-handlers.ts)
// ---------------------------------------------------------------------------

function isPathWithin(base: string, target: string): boolean {
  const resolvedBase = path.resolve(base) + path.sep;
  const resolvedTarget = path.resolve(target);
  return (
    resolvedTarget.startsWith(resolvedBase) ||
    resolvedTarget === path.resolve(base)
  );
}

function isSafeReadPath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const cwd = process.cwd();
  const tmp = os.tmpdir();
  return isPathWithin(cwd, resolved) || isPathWithin(tmp, resolved);
}

// ---------------------------------------------------------------------------
// CloudFormation YAML schema — decodes short-form intrinsic tags to the
// long-form JSON shape that CloudFormation natively uses ({"Fn::X": ...}).
// This gives the agent a single canonical structure to reason about regardless
// of whether the input was YAML or JSON.
// ---------------------------------------------------------------------------

/** The CF intrinsic tags with their long-form `Fn::X` equivalents. */
const INTRINSIC_TAGS: ReadonlyArray<readonly [string, string]> = [
  ["!Ref", "Ref"],
  ["!GetAtt", "Fn::GetAtt"],
  ["!Sub", "Fn::Sub"],
  ["!Join", "Fn::Join"],
  ["!If", "Fn::If"],
  ["!Equals", "Fn::Equals"],
  ["!Not", "Fn::Not"],
  ["!And", "Fn::And"],
  ["!Or", "Fn::Or"],
  ["!FindInMap", "Fn::FindInMap"],
  ["!Base64", "Fn::Base64"],
  ["!Select", "Fn::Select"],
  ["!Split", "Fn::Split"],
  ["!ImportValue", "Fn::ImportValue"],
  ["!Cidr", "Fn::Cidr"],
  ["!GetAZs", "Fn::GetAZs"],
  ["!Transform", "Fn::Transform"],
  ["!Condition", "Condition"],
  ["!ToJsonString", "Fn::ToJsonString"],
  ["!Length", "Fn::Length"],
];

function buildCloudFormationYamlSchema(): yaml.Schema {
  const kinds: ReadonlyArray<"scalar" | "sequence" | "mapping"> = [
    "scalar",
    "sequence",
    "mapping",
  ];
  const types: yaml.Type[] = [];
  for (const [short, long] of INTRINSIC_TAGS) {
    for (const kind of kinds) {
      types.push(
        new yaml.Type(short, {
          kind,
          construct(data: unknown) {
            // GetAtt short-form supports "Resource.Attr" — expand into [Resource, Attr]
            if (short === "!GetAtt" && typeof data === "string") {
              const [res, ...attrParts] = data.split(".");
              return { [long]: [res, attrParts.join(".")] };
            }
            return { [long]: data };
          },
        }),
      );
    }
  }
  return yaml.DEFAULT_SCHEMA.extend(types);
}

const CF_YAML_SCHEMA = buildCloudFormationYamlSchema();

/** Parse a CF template into a canonical object form. */
function parseCfTemplate(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  // JSON path
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        `Template looked like JSON but failed to parse: ${(e as Error).message}`,
      );
    }
  }
  // YAML path
  try {
    const parsed = yaml.load(content, { schema: CF_YAML_SCHEMA }) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("Template root must be a mapping");
  } catch (e) {
    throw new Error(`YAML parse failed: ${(e as Error).message}`);
  }
}

/** Summarise parsed sections for a compact, agent-friendly response. */
function summariseSections(doc: Record<string, unknown>): string {
  const lines: string[] = [];
  const section = (name: string): Record<string, unknown> | null => {
    const v = doc[name];
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  };

  if (doc.AWSTemplateFormatVersion) {
    lines.push(`AWSTemplateFormatVersion: ${doc.AWSTemplateFormatVersion}`);
  }
  if (doc.Description) {
    const desc = String(doc.Description);
    lines.push(
      `Description: ${desc.length > 120 ? desc.slice(0, 117) + "..." : desc}`,
    );
  }
  if (doc.Transform) {
    lines.push(`Transform: ${JSON.stringify(doc.Transform)}`);
  }

  const params = section("Parameters");
  lines.push(`Parameters (${params ? Object.keys(params).length : 0}):`);
  if (params) {
    for (const [name, spec] of Object.entries(params)) {
      const s = spec as Record<string, unknown>;
      lines.push(
        `  - ${name}: Type=${s.Type ?? "?"}` +
          (s.Default !== undefined ? ` Default=${JSON.stringify(s.Default)}` : "") +
          (s.NoEcho ? " (NoEcho)" : ""),
      );
    }
  }

  const mappings = section("Mappings");
  lines.push(`Mappings (${mappings ? Object.keys(mappings).length : 0}):`);
  if (mappings) {
    for (const name of Object.keys(mappings)) lines.push(`  - ${name}`);
  }

  const conditions = section("Conditions");
  lines.push(`Conditions (${conditions ? Object.keys(conditions).length : 0}):`);
  if (conditions) {
    for (const name of Object.keys(conditions)) lines.push(`  - ${name}`);
  }

  const resources = section("Resources");
  const resCount = resources ? Object.keys(resources).length : 0;
  lines.push(`Resources (${resCount}):`);
  if (resources) {
    for (const [name, spec] of Object.entries(resources)) {
      const s = spec as Record<string, unknown>;
      lines.push(`  - ${name}: ${s.Type ?? "?"}`);
    }
  }

  const outputs = section("Outputs");
  lines.push(`Outputs (${outputs ? Object.keys(outputs).length : 0}):`);
  if (outputs) {
    for (const name of Object.keys(outputs)) lines.push(`  - ${name}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Handler factory — returns a map combining CF-specific + shared handlers
// ---------------------------------------------------------------------------

export function createCfToolHandlers(
  callbacks?: ToolHandlerCallbacks,
): Record<string, (input: Record<string, unknown>) => Promise<ToolResult>> {
  // ---- Tool 1: read_cf_template -----------------------------------------
  async function readCfTemplate(
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const filePath = String(input.path ?? "");
    if (!filePath) return err("Missing 'path' parameter");
    const resolved = path.resolve(filePath);
    if (!isSafeReadPath(resolved)) {
      return err("Refusing to read file outside CWD or temp directory");
    }
    const ext = path.extname(resolved).toLowerCase();
    if (![".yaml", ".yml", ".json", ".template"].includes(ext)) {
      return err(
        `Unsupported extension '${ext}'. Expected .yaml, .yml, .json, or .template.`,
      );
    }
    try {
      const content = fs.readFileSync(resolved, "utf-8");
      return ok(content);
    } catch (e) {
      return err(`Failed to read ${resolved}: ${(e as Error).message}`);
    }
  }

  // ---- Tool 2: parse_cloudformation -------------------------------------
  async function parseCloudformation(
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const content = String(input.content ?? "");
    if (!content) return err("Missing 'content' parameter");
    let doc: Record<string, unknown>;
    try {
      doc = parseCfTemplate(content);
    } catch (e) {
      return err((e as Error).message);
    }
    const summary = summariseSections(doc);
    // Return both the structured JSON (for Claude to reason over) AND the
    // human-readable summary (so token usage is bounded for huge templates).
    const body = JSON.stringify(doc, null, 2);
    const MAX_BODY = 60_000; // ~15k tokens ceiling
    const bodyOut =
      body.length > MAX_BODY
        ? body.slice(0, MAX_BODY) +
          `\n\n... [truncated ${body.length - MAX_BODY} chars; call again with smaller sections if needed]`
        : body;
    return ok(`# Parsed CloudFormation\n\n## Summary\n${summary}\n\n## Canonical JSON\n\`\`\`json\n${bodyOut}\n\`\`\``);
  }

  // ---- Tool 3: lookup_cf_resource_mapping -------------------------------
  async function lookupCfResourceMapping(
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const cfType = String(input.cf_resource_type ?? "").trim();
    if (!cfType) return err("Missing 'cf_resource_type' parameter");
    if (!(cfType in CF_RESOURCE_TYPE_MAP)) {
      return ok(
        `No built-in mapping for '${cfType}'. Fall back to the Terraform MCP tool ` +
          `get_provider_details with provider="aws" to fetch the authoritative schema, ` +
          `or emit a comment if this type has no AWS Terraform equivalent.`,
      );
    }
    const tf = CF_RESOURCE_TYPE_MAP[cfType];
    if (tf === null) {
      return ok(
        `'${cfType}' has NO direct Terraform equivalent (commonly nested stacks / ` +
          `custom resources / macros). Emit a comment in main.tf explaining that the user ` +
          `should manually factor this into a Terraform module.`,
      );
    }
    return ok(`${cfType} -> ${tf}`);
  }

  // Pull in the shared HCL handlers (generate_terraform, write_terraform_files,
  // format_terraform, validate_terraform) and compose the final map.
  const shared = createToolHandlers(callbacks);

  return {
    read_cf_template: readCfTemplate,
    parse_cloudformation: parseCloudformation,
    lookup_cf_resource_mapping: lookupCfResourceMapping,
    generate_terraform: shared.generate_terraform,
    write_terraform_files: shared.write_terraform_files,
    format_terraform: shared.format_terraform,
    validate_terraform: shared.validate_terraform,
  };
}
