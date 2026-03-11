// ---------------------------------------------------------------------------
// Bicep-to-Terraform UI — shared TypeScript types
// ---------------------------------------------------------------------------

/** Discriminated union for server-sent stream events. */
export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; isError: boolean }
  | { type: "terraform_output"; files: TerraformFiles }
  | { type: "validation"; passed: boolean; output: string }
  | { type: "progress"; step: number; total: number; label: string }
  | { type: "done"; fullReply: string; toolCalls: ToolCallInfo[] }
  | { type: "error"; message: string };

/** Overall conversion lifecycle status. */
export type ConversionStatus =
  | "idle"
  | "converting"
  | "validating"
  | "done"
  | "error";

/** Map of filename -> HCL content for generated Terraform files. */
export type TerraformFiles = Record<string, string>;

/** Result of running `tofu validate` / `terraform validate`. */
export interface ValidationResult {
  passed: boolean;
  output: string;
  errors?: ValidationError[];
}

/** A single validation diagnostic. */
export interface ValidationError {
  line?: number;
  message: string;
  severity: "error" | "warning";
}

/** One entry in the conversion history sidebar. */
export interface ConversionHistoryEntry {
  id: string;
  timestamp: string;
  bicepFile: string;
  bicepContent: string;
  terraformFiles: TerraformFiles;
  validationPassed: boolean;
  agentConversation: ConversationMessage[];
  resourcesConverted: number;
}

/** A single message in the agent conversation log. */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  timestamp: string;
}

/** Metadata about a single tool invocation. */
export interface ToolCallInfo {
  tool: string;
  input: Record<string, unknown>;
}

/** Progress indicator for multi-step conversion. */
export interface ConversionProgress {
  step: number;
  total: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Deployment Agent Types
// ---------------------------------------------------------------------------

/** Discriminated union for deployment SSE events. */
export type DeployStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool_result"; toolName: string; isError: boolean }
  | { type: "deploy_progress"; phase: DeployPhase; detail: string }
  | { type: "test_result"; testName: string; passed: boolean; detail: string }
  | { type: "outputs"; outputs: Record<string, string> }
  | { type: "progress"; step: number; total: number; label: string }
  | { type: "done"; fullReply: string; toolCalls: ToolCallInfo[]; summary: DeploySummary }
  | { type: "error"; message: string };

/** Deployment lifecycle phases. */
export type DeployPhase =
  | "planning"
  | "applying"
  | "testing"
  | "awaiting_destroy_decision"
  | "destroying"
  | "complete";

/** Overall deployment lifecycle status. */
export type DeploymentStatus =
  | "idle"
  | "deploying"
  | "testing"
  | "awaiting_destroy"
  | "destroying"
  | "done"
  | "error";

/** A single smoke test result. */
export interface TestResult {
  testName: string;
  passed: boolean;
  detail: string;
  category: "existence" | "connectivity" | "config_validation";
}

/** Summary emitted with the deployment "done" event. */
export interface DeploySummary {
  resourceGroupName: string;
  resourcesDeployed: number;
  testsPassed: number;
  testsFailed: number;
  destroyed: boolean;
}

/** Progress indicator for deployment steps. */
export interface DeploymentProgress {
  step: number;
  total: number;
  label: string;
}
