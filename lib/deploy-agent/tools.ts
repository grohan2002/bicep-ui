// ---------------------------------------------------------------------------
// Anthropic SDK tool definitions for the deployment testing agent.
// ---------------------------------------------------------------------------

import type Anthropic from "@anthropic-ai/sdk";

type Tool = Anthropic.Tool;

export const deployTools: Tool[] = [
  {
    name: "terraform_plan",
    description:
      "Run terraform/tofu plan in the working directory. Returns the plan output " +
      "showing what resources will be created, modified, or destroyed.",
    input_schema: {
      type: "object" as const,
      properties: {
        working_dir: {
          type: "string",
          description: "Directory containing the .tf files.",
        },
      },
      required: ["working_dir"],
    },
  },

  {
    name: "terraform_apply",
    description:
      "Run terraform/tofu apply with auto-approve in the working directory. " +
      "Deploys the planned infrastructure to Azure.",
    input_schema: {
      type: "object" as const,
      properties: {
        working_dir: {
          type: "string",
          description: "Directory containing the .tf files.",
        },
      },
      required: ["working_dir"],
    },
  },

  {
    name: "get_terraform_outputs",
    description:
      "Run terraform/tofu output -json and return all outputs from the deployment. " +
      "Useful for getting resource IDs, endpoints, and other values.",
    input_schema: {
      type: "object" as const,
      properties: {
        working_dir: {
          type: "string",
          description: "Directory containing the .tf files.",
        },
      },
      required: ["working_dir"],
    },
  },

  {
    name: "check_azure_resource",
    description:
      "Verify an Azure resource exists using the Azure CLI. " +
      "Pass either the full resource ID, or resource group + type + name.",
    input_schema: {
      type: "object" as const,
      properties: {
        resource_id: {
          type: "string",
          description: "Full Azure resource ID (e.g., /subscriptions/.../resourceGroups/.../providers/...).",
        },
        resource_group: {
          type: "string",
          description: "Resource group name (use with resource_type and resource_name).",
        },
        resource_type: {
          type: "string",
          description: "Resource type (e.g., Microsoft.Storage/storageAccounts).",
        },
        resource_name: {
          type: "string",
          description: "Resource name.",
        },
      },
      required: [],
    },
  },

  {
    name: "run_connectivity_test",
    description:
      "Test network connectivity to a deployed resource. Supports HTTP/HTTPS " +
      "endpoint checks, DNS resolution, and TCP port checks.",
    input_schema: {
      type: "object" as const,
      properties: {
        test_type: {
          type: "string",
          enum: ["http", "dns", "tcp"],
          description: "Type of connectivity test to run.",
        },
        target: {
          type: "string",
          description:
            "Target endpoint: URL for http, hostname for dns, host:port for tcp.",
        },
        expected_status: {
          type: "number",
          description: "Expected HTTP status code (for http test type). Default: 200.",
        },
        timeout_seconds: {
          type: "number",
          description: "Timeout in seconds. Default: 10.",
        },
      },
      required: ["test_type", "target"],
    },
  },

  {
    name: "check_resource_config",
    description:
      "Validate that a deployed Azure resource's configuration matches expected " +
      "values. Uses 'az resource show' and compares specific properties using " +
      "dot-notation paths (e.g., 'properties.supportsHttpsTrafficOnly').",
    input_schema: {
      type: "object" as const,
      properties: {
        resource_id: {
          type: "string",
          description: "Full Azure resource ID.",
        },
        expected_properties: {
          type: "string",
          description:
            'JSON string mapping dot-notation property paths to expected values. ' +
            'E.g., \'{"properties.supportsHttpsTrafficOnly": true, "sku.name": "Standard_LRS"}\'',
        },
      },
      required: ["resource_id", "expected_properties"],
    },
  },

  {
    name: "terraform_destroy",
    description:
      "Run terraform/tofu destroy with auto-approve to tear down all deployed " +
      "resources. ONLY call this after receiving explicit user confirmation to destroy.",
    input_schema: {
      type: "object" as const,
      properties: {
        working_dir: {
          type: "string",
          description: "Directory containing the .tf files.",
        },
      },
      required: ["working_dir"],
    },
  },
];
