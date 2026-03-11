// ---------------------------------------------------------------------------
// POST /api/deploy/setup — Pre-flight for deployment testing.
//
// Creates a temporary working directory, writes Terraform files,
// creates an Azure resource group, and runs `tofu init`.
// Returns { workingDir, resourceGroupName } on success.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let terraformFiles: Record<string, string>;
  let location: string;

  try {
    const body = await request.json();
    terraformFiles = body.terraformFiles;
    location = typeof body.location === "string" ? body.location : "eastus";

    if (
      !terraformFiles ||
      typeof terraformFiles !== "object" ||
      Object.keys(terraformFiles).length === 0
    ) {
      return Response.json(
        { error: "Missing or invalid 'terraformFiles' in request body" },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Generate unique resource group name
  const suffix = crypto.randomBytes(4).toString("hex");
  const resourceGroupName = `rg-bicep-test-${suffix}`;

  // Create temp working directory
  const workingDir = path.join(os.tmpdir(), `bicep-deploy-${suffix}`);

  try {
    fs.mkdirSync(workingDir, { recursive: true });

    // Write all .tf files
    for (const [filename, content] of Object.entries(terraformFiles)) {
      const safeFilename = path.basename(filename); // prevent path traversal
      fs.writeFileSync(path.join(workingDir, safeFilename), content, "utf-8");
    }

    // Write terraform.tfvars with resource group and location
    const tfvars = [
      `resource_group_name = "${resourceGroupName}"`,
      `location            = "${location}"`,
    ].join("\n");
    fs.writeFileSync(path.join(workingDir, "terraform.tfvars"), tfvars, "utf-8");

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

    // Create resource group
    try {
      execSync(
        `az group create -n "${resourceGroupName}" -l "${location}" -o none`,
        { timeout: 30_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      );
    } catch (err: unknown) {
      const execErr = err as { stderr?: string };
      return Response.json(
        {
          error: `Failed to create resource group: ${execErr.stderr ?? "unknown error"}`,
        },
        { status: 500 },
      );
    }

    // Run tofu/terraform init
    try {
      execSync(`${cli} init -input=false -no-color`, {
        cwd: workingDir,
        timeout: 120_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; status?: number };
      const combined = [execErr.stdout, execErr.stderr]
        .filter(Boolean)
        .join("\n");
      return Response.json(
        {
          error: `${cli} init failed (exit ${execErr.status ?? "unknown"}):\n${combined}`,
        },
        { status: 500 },
      );
    }

    return Response.json({ workingDir, resourceGroupName, cli });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Setup failed: ${msg}` }, { status: 500 });
  }
}
