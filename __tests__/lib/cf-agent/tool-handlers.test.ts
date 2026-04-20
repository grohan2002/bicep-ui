import { describe, it, expect } from "vitest";
import { createCfToolHandlers } from "@/lib/cf-agent/tool-handlers";

describe("CF tool handlers", () => {
  const handlers = createCfToolHandlers();

  // -------------------------------------------------------------------------
  // parse_cloudformation
  // -------------------------------------------------------------------------

  describe("parse_cloudformation", () => {
    it("parses a minimal JSON template", async () => {
      const content = JSON.stringify({
        AWSTemplateFormatVersion: "2010-09-09",
        Resources: {
          Bucket: { Type: "AWS::S3::Bucket", Properties: { BucketName: "x" } },
        },
      });
      const result = await handlers.parse_cloudformation({ content });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toContain("Resources (1):");
      expect(result.data).toContain("Bucket: AWS::S3::Bucket");
      expect(result.data).toContain("AWSTemplateFormatVersion");
    });

    it("parses a minimal YAML template and decodes !Ref into Ref", async () => {
      const content = `\
AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  Env:
    Type: String
    Default: dev
Resources:
  Bucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref Env
`;
      const result = await handlers.parse_cloudformation({ content });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toContain("Parameters (1):");
      expect(result.data).toContain("Resources (1):");
      // The Ref short-form should decode into the JSON long-form.
      expect(result.data).toContain('"Ref": "Env"');
    });

    it("decodes !GetAtt short-form with Resource.Attr into a two-element array", async () => {
      const content = `\
Resources:
  Role:
    Type: AWS::IAM::Role
  Func:
    Type: AWS::Lambda::Function
    Properties:
      Role: !GetAtt Role.Arn
`;
      const result = await handlers.parse_cloudformation({ content });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Long-form: {"Fn::GetAtt": ["Role", "Arn"]}
      expect(result.data).toContain('"Fn::GetAtt"');
      expect(result.data).toContain('"Role"');
      expect(result.data).toContain('"Arn"');
    });

    it("decodes multiple intrinsic short-forms", async () => {
      const content = `\
Resources:
  Q:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "q-\${AWS::StackName}"
      Tags:
        - Key: Env
          Value: !If [IsProd, "production", "nonprod"]
`;
      const result = await handlers.parse_cloudformation({ content });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toContain('"Fn::Sub"');
      expect(result.data).toContain('"Fn::If"');
    });

    it("errors on invalid YAML", async () => {
      const result = await handlers.parse_cloudformation({
        content: "::not: valid: yaml: at all:::",
      });
      expect(result.ok).toBe(false);
    });

    it("errors on empty content", async () => {
      const result = await handlers.parse_cloudformation({ content: "" });
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // lookup_cf_resource_mapping
  // -------------------------------------------------------------------------

  describe("lookup_cf_resource_mapping", () => {
    it("returns a known mapping", async () => {
      const result = await handlers.lookup_cf_resource_mapping({
        cf_resource_type: "AWS::S3::Bucket",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toContain("aws_s3_bucket");
    });

    it("falls back to an MCP hint for unknown types", async () => {
      const result = await handlers.lookup_cf_resource_mapping({
        cf_resource_type: "AWS::NotAReal::Service",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toContain("get_provider_details");
    });

    it("notes that nested stacks have no direct equivalent", async () => {
      const result = await handlers.lookup_cf_resource_mapping({
        cf_resource_type: "AWS::CloudFormation::Stack",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toContain("NO direct Terraform equivalent");
    });

    it("errors on missing type", async () => {
      const result = await handlers.lookup_cf_resource_mapping({});
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // read_cf_template
  // -------------------------------------------------------------------------

  describe("read_cf_template", () => {
    it("rejects unsupported extensions", async () => {
      const result = await handlers.read_cf_template({ path: "main.bicep" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("Unsupported extension");
    });

    it("rejects missing path", async () => {
      const result = await handlers.read_cf_template({});
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Shared HCL tool handlers are re-exported
  // -------------------------------------------------------------------------

  it("exposes the shared generate_terraform handler", () => {
    expect(typeof handlers.generate_terraform).toBe("function");
    expect(typeof handlers.write_terraform_files).toBe("function");
    expect(typeof handlers.validate_terraform).toBe("function");
    expect(typeof handlers.format_terraform).toBe("function");
  });
});
