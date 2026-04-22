import { describe, it, expect } from "vitest";
import {
  parseNestedStackReferences,
  detectCloudFormationEntryPoint,
  buildCloudFormationDependencyGraph,
  summarizeCloudFormationContext,
  summarizeCloudFormationFile,
  buildCloudFormationMultiFileUserMessage,
} from "@/lib/cf-modules";

// ---------------------------------------------------------------------------
// parseNestedStackReferences
// ---------------------------------------------------------------------------

describe("parseNestedStackReferences", () => {
  it("returns no refs for a template with no nested stacks", () => {
    const yaml = `\
Resources:
  Bucket:
    Type: AWS::S3::Bucket
`;
    expect(parseNestedStackReferences("main.yaml", yaml)).toEqual([]);
  });

  it("finds a single nested stack with a relative TemplateURL", () => {
    const yaml = `\
Resources:
  Network:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./templates/network.yaml
`;
    const refs = parseNestedStackReferences("main.yaml", yaml);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      name: "Network",
      source: "./templates/network.yaml",
      declaredIn: "main.yaml",
      resolvedPath: "templates/network.yaml",
    });
  });

  it("finds multiple nested stacks", () => {
    const yaml = `\
Resources:
  Network:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./templates/network.yaml
  Storage:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./templates/storage.yaml
`;
    const refs = parseNestedStackReferences("main.yaml", yaml);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.name).sort()).toEqual(["Network", "Storage"]);
  });

  it("marks HTTPS / S3 TemplateURLs as unresolved", () => {
    const yaml = `\
Resources:
  External:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://s3.amazonaws.com/my-bucket/network.yaml
  External2:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: s3://my-bucket/storage.yaml
`;
    const refs = parseNestedStackReferences("main.yaml", yaml);
    expect(refs).toHaveLength(2);
    expect(refs.every((r) => r.resolvedPath === null)).toBe(true);
  });

  it("resolves relative paths from a nested file", () => {
    const yaml = `\
Resources:
  Sub:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./sub/inner.yaml
`;
    const refs = parseNestedStackReferences("templates/parent.yaml", yaml);
    expect(refs[0].resolvedPath).toBe("templates/sub/inner.yaml");
  });

  it("supports JSON CloudFormation", () => {
    const json = JSON.stringify({
      Resources: {
        Net: {
          Type: "AWS::CloudFormation::Stack",
          Properties: { TemplateURL: "templates/net.yaml" },
        },
      },
    });
    const refs = parseNestedStackReferences("main.json", json);
    expect(refs).toHaveLength(1);
    expect(refs[0].resolvedPath).toBe("templates/net.yaml");
  });

  it("ignores non-Stack resources", () => {
    const yaml = `\
Resources:
  Bucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: foo
  Stack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./inner.yaml
`;
    const refs = parseNestedStackReferences("main.yaml", yaml);
    expect(refs.map((r) => r.name)).toEqual(["Stack"]);
  });

  it("returns empty for malformed templates rather than throwing", () => {
    expect(parseNestedStackReferences("bad.yaml", ":::not yaml")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// detectCloudFormationEntryPoint
// ---------------------------------------------------------------------------

describe("detectCloudFormationEntryPoint", () => {
  it("returns empty string for empty input", () => {
    expect(detectCloudFormationEntryPoint({})).toBe("");
  });

  it("prefers main.yaml over alphabetical", () => {
    const ep = detectCloudFormationEntryPoint({
      "alpha.yaml": "Resources: {}",
      "main.yaml": "Resources: {}",
    });
    expect(ep).toBe("main.yaml");
  });

  it("falls back to template.yaml when main is absent", () => {
    const ep = detectCloudFormationEntryPoint({
      "template.yaml": "Resources: {}",
      "z-extra.yaml": "Resources: {}",
    });
    expect(ep).toBe("template.yaml");
  });

  it("returns the sole root file when there's only one", () => {
    expect(
      detectCloudFormationEntryPoint({
        "stack.yaml": "Resources: {}",
        "templates/sub.yaml": "Resources: {}",
      }),
    ).toBe("stack.yaml");
  });

  it("picks the root file with the most nested-stack references", () => {
    const filesA = "Resources: {}";
    const filesB = `\
Resources:
  N:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: ./other.yaml
`;
    const ep = detectCloudFormationEntryPoint({
      "a.yaml": filesA,
      "b.yaml": filesB,
      "other.yaml": filesA,
    });
    // b.yaml has one nested-stack reference; a.yaml has zero; other.yaml is root.
    // Among the three roots, b should win.
    expect(ep).toBe("b.yaml");
  });
});

// ---------------------------------------------------------------------------
// buildCloudFormationDependencyGraph
// ---------------------------------------------------------------------------

describe("buildCloudFormationDependencyGraph", () => {
  it("orders leaves before parents", () => {
    const files = {
      "main.yaml": `\
Resources:
  Net:
    Type: AWS::CloudFormation::Stack
    Properties: { TemplateURL: ./network.yaml }
  Stg:
    Type: AWS::CloudFormation::Stack
    Properties: { TemplateURL: ./storage.yaml }
`,
      "network.yaml": "Resources: {}",
      "storage.yaml": "Resources: {}",
    };

    const g = buildCloudFormationDependencyGraph(files);
    expect(g.processingOrder).toHaveLength(3);
    // main.yaml depends on the others, so it must be last
    expect(g.processingOrder[g.processingOrder.length - 1]).toBe("main.yaml");
    expect(g.modules).toHaveLength(2);
    expect(g.unresolvedModules).toHaveLength(0);
  });

  it("records external (HTTPS) refs as unresolved", () => {
    const files = {
      "main.yaml": `\
Resources:
  External:
    Type: AWS::CloudFormation::Stack
    Properties: { TemplateURL: https://s3.example.com/x.yaml }
`,
    };
    const g = buildCloudFormationDependencyGraph(files);
    expect(g.unresolvedModules).toHaveLength(1);
    expect(g.modules).toHaveLength(0);
  });

  it("appends cyclic files at the end without throwing", () => {
    const files = {
      "a.yaml": `\
Resources:
  B:
    Type: AWS::CloudFormation::Stack
    Properties: { TemplateURL: ./b.yaml }
`,
      "b.yaml": `\
Resources:
  A:
    Type: AWS::CloudFormation::Stack
    Properties: { TemplateURL: ./a.yaml }
`,
    };
    const g = buildCloudFormationDependencyGraph(files);
    expect(g.processingOrder.sort()).toEqual(["a.yaml", "b.yaml"]);
    expect(g.modules).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// summariseCloudFormationContext + summariseCloudFormationFile
// ---------------------------------------------------------------------------

describe("summarizeCloudFormationContext", () => {
  it("does not flag small projects as exceeding budget", () => {
    const ctx = summarizeCloudFormationContext(
      { "main.yaml": "Resources: {}" },
      "main.yaml",
    );
    expect(ctx.totalFiles).toBe(1);
    expect(ctx.exceedsTokenBudget).toBe(false);
    expect(ctx.entryPoint).toBe("main.yaml");
  });
});

describe("summarizeCloudFormationFile", () => {
  it("extracts Parameters / Resources / Outputs into a comment block", () => {
    const yaml = `\
Parameters:
  P1: { Type: String }
Resources:
  R1:
    Type: AWS::S3::Bucket
  R2:
    Type: AWS::IAM::Role
Outputs:
  O1: { Value: 1 }
`;
    const out = summarizeCloudFormationFile("main.yaml", yaml);
    expect(out).toContain("Parameters: P1");
    expect(out).toContain("R1: AWS::S3::Bucket");
    expect(out).toContain("R2: AWS::IAM::Role");
    expect(out).toContain("Outputs: O1");
  });
});

// ---------------------------------------------------------------------------
// buildCloudFormationMultiFileUserMessage
// ---------------------------------------------------------------------------

describe("buildCloudFormationMultiFileUserMessage", () => {
  it("includes the dependency graph and inlines all files in topological order", () => {
    const files = {
      "main.yaml": `\
Resources:
  Net:
    Type: AWS::CloudFormation::Stack
    Properties: { TemplateURL: ./network.yaml }
`,
      "network.yaml": "Resources: {}",
    };
    const ctx = summarizeCloudFormationContext(files, "main.yaml");
    const graph = buildCloudFormationDependencyGraph(files);
    const msg = buildCloudFormationMultiFileUserMessage(
      files,
      "main.yaml",
      graph,
      ctx,
    );
    expect(msg).toContain("Convert the following multi-file AWS CloudFormation");
    expect(msg).toContain("Nested-stack dependency graph");
    expect(msg).toContain("main.yaml --AWS::CloudFormation::Stack 'Net'--> network.yaml");
    expect(msg).toContain("### File: network.yaml");
    expect(msg).toContain("### File: main.yaml");
    // network must appear before main in the inlined sections (topological)
    expect(msg.indexOf("### File: network.yaml")).toBeLessThan(
      msg.indexOf("### File: main.yaml"),
    );
    // Multi-file footer includes the read_cf_file_content guidance
    expect(msg).toContain("Do NOT call read_cf_template");
  });
});
