// ---------------------------------------------------------------------------
// POST /api/deploy/destroy — Deterministic teardown (no LLM).
//
// Runs `tofu destroy` in the working directory, then deletes the
// Azure resource group. Returns { success, output }.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { execSync } from "node:child_process";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let workingDir: string;
  let resourceGroupName: string;

  try {
    const body = await request.json();
    workingDir = body.workingDir;
    resourceGroupName = body.resourceGroupName;

    if (!workingDir || typeof workingDir !== "string") {
      return Response.json(
        { error: "Missing or invalid 'workingDir'" },
        { status: 400 },
      );
    }
    if (!resourceGroupName || typeof resourceGroupName !== "string") {
      return Response.json(
        { error: "Missing or invalid 'resourceGroupName'" },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Detect CLI
  let cli: string;
  try {
    execSync("which tofu", { stdio: "pipe" });
    cli = "tofu";
  } catch {
    try {
      execSync("which terraform", { stdio: "pipe" });
      cli = "terraform";
    } catch {
      return Response.json(
        { error: "Neither 'tofu' nor 'terraform' found in PATH." },
        { status: 500 },
      );
    }
  }

  const outputs: string[] = [];

  // 1. Run tofu/terraform destroy
  try {
    const destroyOutput = execSync(
      `${cli} destroy -auto-approve -no-color -input=false`,
      {
        cwd: workingDir,
        timeout: 300_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    outputs.push(`${cli} destroy:\n${destroyOutput}`);
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; status?: number };
    const combined = [execErr.stdout, execErr.stderr]
      .filter(Boolean)
      .join("\n");
    outputs.push(
      `${cli} destroy failed (exit ${execErr.status ?? "unknown"}):\n${combined}`,
    );
    // Continue to delete the resource group even if destroy fails
  }

  // 2. Delete the Azure resource group (async, non-blocking)
  try {
    execSync(
      `az group delete -n "${resourceGroupName}" --yes --no-wait`,
      {
        timeout: 30_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    outputs.push(`Resource group '${resourceGroupName}' deletion initiated.`);
  } catch (err: unknown) {
    const execErr = err as { stderr?: string };
    outputs.push(
      `Warning: Failed to delete resource group: ${execErr.stderr ?? "unknown error"}`,
    );
  }

  return Response.json({
    success: true,
    output: outputs.join("\n\n"),
  });
}
