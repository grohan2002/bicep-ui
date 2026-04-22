// ---------------------------------------------------------------------------
// js-yaml schema for CloudFormation templates.
//
// CloudFormation YAML supports intrinsic short-forms (!Ref, !GetAtt, !Sub,
// !Join, !If, !FindInMap, etc.) that aren't part of standard YAML. This
// custom schema decodes each short-form into its canonical {"Fn::X": ...}
// JSON long-form so downstream code can reason over a single normalised shape
// regardless of YAML vs JSON input.
//
// This module is **browser-safe** — no Node-only imports — so the same schema
// can be used by both server-side handlers (lib/cf-agent/tool-handlers.ts)
// and client-side parsers (lib/cf-modules.ts → multi-file-upload.tsx).
// ---------------------------------------------------------------------------

import yaml from "js-yaml";

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
            // !GetAtt short-form supports "Resource.Attr" — expand into
            // [Resource, Attr] which is the canonical Fn::GetAtt shape.
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

export const CF_YAML_SCHEMA = buildCloudFormationYamlSchema();
