import { describe, it, expect } from "vitest";
import { CF_RESOURCE_TYPE_MAP, AWS_DATA_SOURCES } from "@/lib/cf-mappings";

describe("CF_RESOURCE_TYPE_MAP", () => {
  it("has at least 40 entries", () => {
    expect(Object.keys(CF_RESOURCE_TYPE_MAP).length).toBeGreaterThanOrEqual(40);
  });

  it("maps core storage and compute resources correctly", () => {
    expect(CF_RESOURCE_TYPE_MAP["AWS::S3::Bucket"]).toBe("aws_s3_bucket");
    expect(CF_RESOURCE_TYPE_MAP["AWS::EC2::Instance"]).toBe("aws_instance");
    expect(CF_RESOURCE_TYPE_MAP["AWS::Lambda::Function"]).toBe("aws_lambda_function");
    expect(CF_RESOURCE_TYPE_MAP["AWS::RDS::DBInstance"]).toBe("aws_db_instance");
    expect(CF_RESOURCE_TYPE_MAP["AWS::DynamoDB::Table"]).toBe("aws_dynamodb_table");
  });

  it("maps networking and IAM resources correctly", () => {
    expect(CF_RESOURCE_TYPE_MAP["AWS::EC2::VPC"]).toBe("aws_vpc");
    expect(CF_RESOURCE_TYPE_MAP["AWS::EC2::SecurityGroup"]).toBe("aws_security_group");
    expect(CF_RESOURCE_TYPE_MAP["AWS::IAM::Role"]).toBe("aws_iam_role");
    expect(CF_RESOURCE_TYPE_MAP["AWS::ElasticLoadBalancingV2::LoadBalancer"]).toBe("aws_lb");
  });

  it("explicitly marks nested stacks as unsupported (null)", () => {
    expect(CF_RESOURCE_TYPE_MAP["AWS::CloudFormation::Stack"]).toBeNull();
    expect(CF_RESOURCE_TYPE_MAP["AWS::CloudFormation::CustomResource"]).toBeNull();
  });

  it("every CF key follows the AWS::Service::Resource convention", () => {
    for (const key of Object.keys(CF_RESOURCE_TYPE_MAP)) {
      expect(key).toMatch(/^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/);
    }
  });

  it("every non-null mapped value looks like an aws_* Terraform resource", () => {
    for (const [cfType, tfType] of Object.entries(CF_RESOURCE_TYPE_MAP)) {
      if (tfType === null) continue;
      expect(tfType, `mapping for ${cfType}`).toMatch(/^aws_[a-z0-9_]+$/);
    }
  });
});

describe("AWS_DATA_SOURCES", () => {
  it("exposes the standard pseudo-parameter lookups", () => {
    expect(AWS_DATA_SOURCES.accountId).toBe("data.aws_caller_identity.current.account_id");
    expect(AWS_DATA_SOURCES.region).toBe("data.aws_region.current.name");
    expect(AWS_DATA_SOURCES.partition).toBe("data.aws_partition.current.partition");
  });
});
