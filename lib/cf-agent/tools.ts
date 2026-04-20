// ---------------------------------------------------------------------------
// Anthropic SDK tool definitions for the CloudFormation-to-Terraform agent.
//
// Mirrors lib/agent/tools.ts but with CF-specific parser and mapping tools.
// Shared HCL-output tools (generate_terraform, write_terraform_files,
// format_terraform, validate_terraform) are re-used as-is from the Bicep
// tool definitions to avoid duplication.
// ---------------------------------------------------------------------------

import type Anthropic from "@anthropic-ai/sdk";
import { bicepTools } from "../agent/tools";

type Tool = Anthropic.Tool;

// Pull in the 4 provider-agnostic HCL tools from the Bicep tool array.
// These work unchanged for the AWS provider — they just produce / write / format
// / validate HCL.
const SHARED_TOOL_NAMES = new Set([
  "generate_terraform",
  "write_terraform_files",
  "format_terraform",
  "validate_terraform",
]);
const sharedTools = bicepTools.filter((t) => SHARED_TOOL_NAMES.has(t.name));

/** Tool definitions for the CloudFormation-to-Terraform conversion agent. */
export const cloudformationTools: Tool[] = [
  // Tool 1: Read a CloudFormation template from disk.
  {
    name: "read_cf_template",
    description:
      "Read a CloudFormation template file from disk (.yaml, .yml, .json, or .template) " +
      "and return its contents. Only use this when a file path was provided instead of " +
      "inline content. Path traversal is blocked.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Path to the CloudFormation template file.",
        },
      },
      required: ["path"],
    },
  },

  // Tool 2: Parse a CloudFormation template into a structured object.
  {
    name: "parse_cloudformation",
    description:
      "Parse a CloudFormation template (YAML or JSON) into structured sections. " +
      "YAML intrinsic short-forms (!Ref, !GetAtt, !Sub, !Join, !If, !FindInMap, !Base64, " +
      "!Select, !Split, !ImportValue, !Cidr, !GetAZs, !Transform, !Equals, !Not, !And, !Or) " +
      "are decoded into the canonical JSON long-form ({'Ref': ...}, {'Fn::GetAtt': [...]}). " +
      "Returns {parameters, mappings, conditions, resources, outputs, metadata, transform}. " +
      "Always call this FIRST before attempting any conversion.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "The raw CloudFormation template text (YAML or JSON).",
        },
      },
      required: ["content"],
    },
  },

  // Tool 3: Look up the Terraform equivalent of a CF resource type.
  {
    name: "lookup_cf_resource_mapping",
    description:
      "Look up the Terraform/OpenTofu equivalent of a CloudFormation resource type " +
      "(e.g. 'AWS::S3::Bucket' -> 'aws_s3_bucket'). Returns the mapped aws_* resource " +
      "name or a hint that it requires a Terraform MCP lookup (get_provider_details) " +
      "for types not in the built-in table. BATCH all lookup calls in one turn.",
    input_schema: {
      type: "object" as const,
      properties: {
        cf_resource_type: {
          type: "string",
          description:
            "CloudFormation resource type, e.g. 'AWS::S3::Bucket' or 'AWS::Lambda::Function'.",
        },
      },
      required: ["cf_resource_type"],
    },
  },

  // Shared HCL-output tools (imported from lib/agent/tools.ts)
  ...sharedTools,
];
