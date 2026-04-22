// ---------------------------------------------------------------------------
// CloudFormation multi-file (nested-stack) support — parsing, dependency
// graph, context summarisation. Mirrors lib/bicep-modules.ts.
//
// Nested-stack linkage is via `AWS::CloudFormation::Stack` resources whose
// `Properties.TemplateURL` is a relative path inside the uploaded project.
// HTTPS URLs (e.g. S3 references) are recorded as unresolved.
// ---------------------------------------------------------------------------

import yaml from "js-yaml";
import { CF_YAML_SCHEMA } from "./cf-yaml-schema";
import type {
  CloudFormationFiles,
  CloudFormationModuleRef,
  CloudFormationDependencyGraph,
  InputContextSummary,
} from "./types";

// ---------------------------------------------------------------------------
// Parser — find AWS::CloudFormation::Stack references
// ---------------------------------------------------------------------------

/**
 * Parse a CloudFormation template (YAML or JSON) and find every
 * AWS::CloudFormation::Stack resource. Returns the nested-stack references
 * with their resolved file paths.
 */
export function parseNestedStackReferences(
  filePath: string,
  content: string,
): CloudFormationModuleRef[] {
  const refs: CloudFormationModuleRef[] = [];

  let doc: Record<string, unknown>;
  try {
    doc = parseCfTemplateSafe(content);
  } catch {
    // Malformed templates yield no references — let the agent surface the
    // syntax error during conversion.
    return refs;
  }

  const resources = doc.Resources;
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) {
    return refs;
  }

  for (const [logicalId, raw] of Object.entries(resources as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    if (r.Type !== "AWS::CloudFormation::Stack") continue;

    const props = r.Properties;
    if (!props || typeof props !== "object" || Array.isArray(props)) continue;
    const templateUrl = (props as Record<string, unknown>).TemplateURL;
    if (typeof templateUrl !== "string") continue;

    refs.push({
      name: logicalId,
      source: templateUrl,
      declaredIn: filePath,
      resolvedPath: resolveTemplateUrl(filePath, templateUrl),
    });
  }

  return refs;
}

/**
 * Resolve a TemplateURL value relative to the declaring file. HTTPS / S3 /
 * absolute URLs are unresolved (returned as null).
 */
function resolveTemplateUrl(declaringFile: string, templateUrl: string): string | null {
  if (
    templateUrl.startsWith("http://") ||
    templateUrl.startsWith("https://") ||
    templateUrl.startsWith("s3://")
  ) {
    return null;
  }
  const dir = dirname(declaringFile);
  return normalizePath(join(dir, templateUrl));
}

/**
 * Best-effort parser used by the dependency-graph builder. It accepts either
 * JSON or YAML (with CF intrinsic short-forms) and returns an object form.
 */
function parseCfTemplateSafe(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as Record<string, unknown>;
  }
  const parsed = yaml.load(content, { schema: CF_YAML_SCHEMA }) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("Template root must be a mapping");
}

// ---------------------------------------------------------------------------
// Entry-point detection
// ---------------------------------------------------------------------------

const CF_ROOT_EXTENSIONS = [".yaml", ".yml", ".json", ".template"];
const PREFERRED_ROOTS = [
  "main.yaml",
  "main.yml",
  "main.json",
  "main.template",
  "template.yaml",
  "template.yml",
  "template.json",
  "template.template",
];

function isCfRoot(p: string): boolean {
  if (p.includes("/")) return false;
  const lower = p.toLowerCase();
  return CF_ROOT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Pick the root template for a project. Priority:
 *   1. main.* / template.* in the project root
 *   2. The sole root template (if there's only one)
 *   3. The root template that references the most nested stacks
 *   4. First root file alphabetically, else first file overall
 */
export function detectCloudFormationEntryPoint(files: CloudFormationFiles): string {
  const paths = Object.keys(files);
  if (paths.length === 0) return "";

  for (const name of PREFERRED_ROOTS) {
    if (paths.includes(name)) return name;
  }

  const rootFiles = paths.filter(isCfRoot);
  if (rootFiles.length === 1) return rootFiles[0];

  if (rootFiles.length > 1) {
    let best = rootFiles[0];
    let bestCount = -1;
    for (const p of rootFiles) {
      const refs = parseNestedStackReferences(p, files[p]);
      if (refs.length > bestCount) {
        bestCount = refs.length;
        best = p;
      }
    }
    return best;
  }

  return paths.sort()[0];
}

// ---------------------------------------------------------------------------
// Dependency graph (Kahn's algorithm — leaves first, cycles appended at end)
// ---------------------------------------------------------------------------

export function buildCloudFormationDependencyGraph(
  files: CloudFormationFiles,
): CloudFormationDependencyGraph {
  const allFiles = Object.keys(files);
  const allModules: CloudFormationModuleRef[] = [];
  const unresolved: CloudFormationModuleRef[] = [];

  for (const filePath of allFiles) {
    const refs = parseNestedStackReferences(filePath, files[filePath]);
    for (const ref of refs) {
      if (ref.resolvedPath && ref.resolvedPath in files) {
        allModules.push(ref);
      } else {
        unresolved.push(ref);
      }
    }
  }

  const inDegree: Record<string, number> = {};
  const dependents: Record<string, string[]> = {};
  for (const f of allFiles) {
    inDegree[f] = 0;
    dependents[f] = [];
  }
  for (const mod of allModules) {
    const target = mod.resolvedPath!;
    inDegree[mod.declaredIn] = (inDegree[mod.declaredIn] ?? 0) + 1;
    (dependents[target] ??= []).push(mod.declaredIn);
  }

  const queue: string[] = [];
  for (const f of allFiles) {
    if (inDegree[f] === 0) queue.push(f);
  }

  const processingOrder: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    processingOrder.push(node);
    for (const dep of dependents[node] ?? []) {
      inDegree[dep]--;
      if (inDegree[dep] === 0) queue.push(dep);
    }
  }

  // Cycles → append remaining files at the end
  for (const f of allFiles) {
    if (!processingOrder.includes(f)) processingOrder.push(f);
  }

  return {
    files: allFiles,
    modules: allModules,
    processingOrder,
    unresolvedModules: unresolved,
  };
}

// ---------------------------------------------------------------------------
// Context summarisation (token budget + per-file summarisation)
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function summarizeCloudFormationContext(
  files: CloudFormationFiles,
  entryPoint: string,
): InputContextSummary {
  const entries = Object.entries(files);
  const totalBytes = entries.reduce((sum, [, c]) => sum + c.length, 0);
  const totalLines = entries.reduce((sum, [, c]) => sum + c.split("\n").length, 0);
  const estimatedTokens = estimateTokens(entries.map(([, c]) => c).join("\n"));

  return {
    totalFiles: entries.length,
    totalLines,
    totalBytes,
    entryPoint,
    exceedsTokenBudget: estimatedTokens > 80_000,
  };
}

/**
 * Reduce a CF template to its "interface" — Parameters, Conditions, Resources
 * (type only), Outputs. Used when the full project exceeds the token budget.
 */
export function summarizeCloudFormationFile(filePath: string, content: string): string {
  let doc: Record<string, unknown>;
  try {
    doc = parseCfTemplateSafe(content);
  } catch {
    return `// Summary of ${filePath} — could not parse, full content omitted`;
  }

  const lines = content.split("\n").length;
  const out: string[] = [`# Summary of ${filePath} (${lines} lines)`];

  const section = (key: string) => {
    const v = doc[key];
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  };

  const params = section("Parameters");
  if (params) {
    out.push("# Parameters: " + Object.keys(params).join(", "));
  }
  const conditions = section("Conditions");
  if (conditions) {
    out.push("# Conditions: " + Object.keys(conditions).join(", "));
  }
  const resources = section("Resources");
  if (resources) {
    out.push("# Resources:");
    for (const [name, raw] of Object.entries(resources)) {
      const r = raw as { Type?: unknown };
      out.push(`#   - ${name}: ${typeof r?.Type === "string" ? r.Type : "?"}`);
    }
  }
  const outputs = section("Outputs");
  if (outputs) {
    out.push("# Outputs: " + Object.keys(outputs).join(", "));
  }
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// User message construction for the multi-file CF agent
// ---------------------------------------------------------------------------

export function buildCloudFormationMultiFileUserMessage(
  files: CloudFormationFiles,
  entryPoint: string,
  graph: CloudFormationDependencyGraph,
  summary?: InputContextSummary,
): string {
  const parts: string[] = [];

  parts.push(
    "Convert the following multi-file AWS CloudFormation project to Terraform/OpenTofu HCL " +
      "using the hashicorp/aws provider. Each AWS::CloudFormation::Stack resource maps to a " +
      "Terraform module call (with the nested template's Parameters becoming module input variables " +
      "and the nested Outputs becoming module outputs).",
  );
  parts.push(`Entry point: ${entryPoint}`);
  parts.push(`Total files: ${Object.keys(files).length}`);
  parts.push("");

  if (graph.modules.length > 0) {
    parts.push("## Nested-stack dependency graph");
    for (const mod of graph.modules) {
      parts.push(
        `  ${mod.declaredIn} --AWS::CloudFormation::Stack '${mod.name}'--> ${mod.resolvedPath}`,
      );
    }
    parts.push("");
  }

  if (graph.unresolvedModules.length > 0) {
    parts.push("## Unresolved nested-stack references (external TemplateURL)");
    for (const mod of graph.unresolvedModules) {
      parts.push(
        `  ${mod.declaredIn}: stack '${mod.name}' -> '${mod.source}' (NOT FOUND — external)`,
      );
    }
    parts.push("");
  }

  const useSummary = summary?.exceedsTokenBudget ?? false;

  parts.push("## Files (in dependency order, leaves first)");
  for (const filePath of graph.processingOrder) {
    const content = files[filePath];
    if (!content) continue;
    if (useSummary && filePath !== entryPoint) {
      parts.push(
        `\n### File: ${filePath} (SUMMARIZED — use read_cf_file_content for full content)`,
      );
      parts.push(summarizeCloudFormationFile(filePath, content));
    } else {
      const fence = filePath.toLowerCase().endsWith(".json") ? "json" : "yaml";
      parts.push(`\n### File: ${filePath}`);
      parts.push("```" + fence);
      parts.push(content);
      parts.push("```");
    }
  }

  parts.push("");
  parts.push(
    "IMPORTANT: All files are provided inline above. Do NOT call read_cf_template.",
  );
  if (useSummary) {
    parts.push(
      "Some files are summarized — call read_cf_file_content to fetch the full text when needed.",
    );
  }
  parts.push(
    "Generate a Terraform project that mirrors the nested-stack structure:",
  );
  parts.push(
    "- Root: providers.tf (hashicorp/aws ~> 5.0), variables.tf, main.tf (with module blocks for each nested stack), outputs.tf",
  );
  parts.push(
    "- Each nested CloudFormation template -> modules/<stack-name>/ with main.tf, variables.tf, outputs.tf",
  );
  parts.push(
    "- nested-stack `Parameters` block in the parent → `module \"x\" { source = \"./modules/x\"; <param> = ... }` arguments",
  );
  parts.push(
    "- nested-stack `Outputs` → child module `output` blocks; reference from parent as `module.x.<output_name>`",
  );
  parts.push(
    "- Cross-stack `Fn::ImportValue` in the SOURCE → emit a HEREDOC comment recommending data.terraform_remote_state OR replace with a module input/output if the export comes from a sibling stack in this same project.",
  );
  parts.push(
    "Always batch tool calls aggressively (parse_cloudformation each file in one round, lookup_cf_resource_mapping for all unique types in one round, generate_terraform for all blocks in one round).",
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Path utilities — no Node deps so this works in the browser too
// ---------------------------------------------------------------------------

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

function join(base: string, rel: string): string {
  if (!base) return rel;
  return base + "/" + rel;
}

function normalizePath(p: string): string {
  const parts = p.split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      result.pop();
    } else {
      result.push(part);
    }
  }
  return result.join("/");
}
