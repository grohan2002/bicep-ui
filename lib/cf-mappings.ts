// ---------------------------------------------------------------------------
// CloudFormation -> Terraform/OpenTofu (AWS provider) resource type mappings.
//
// The CF agent calls lookup_cf_resource_mapping to query these. For types not
// in this table it falls back to Terraform MCP (get_provider_details against
// the hashicorp/aws provider) to fetch the authoritative schema.
// ---------------------------------------------------------------------------

/**
 * CloudFormation resource type ("AWS::<Service>::<Resource>")
 *   -> Terraform resource type ("aws_<resource>").
 * `null` means the CF resource is merged into a parent or has no direct
 * equivalent; the agent should inline its properties or emit a comment.
 */
export const CF_RESOURCE_TYPE_MAP: Record<string, string | null> = {
  // ---- Compute ---------------------------------------------------------
  "AWS::EC2::Instance": "aws_instance",
  "AWS::EC2::LaunchTemplate": "aws_launch_template",
  "AWS::AutoScaling::AutoScalingGroup": "aws_autoscaling_group",
  "AWS::AutoScaling::LaunchConfiguration": "aws_launch_configuration",
  "AWS::AutoScaling::ScalingPolicy": "aws_autoscaling_policy",
  "AWS::EC2::KeyPair": "aws_key_pair",
  "AWS::EC2::EIP": "aws_eip",
  "AWS::EC2::EIPAssociation": "aws_eip_association",

  // ---- Storage ---------------------------------------------------------
  "AWS::S3::Bucket": "aws_s3_bucket",
  "AWS::S3::BucketPolicy": "aws_s3_bucket_policy",
  "AWS::S3::AccessPoint": "aws_s3_access_point",
  "AWS::EBS::Volume": "aws_ebs_volume",
  "AWS::EC2::Volume": "aws_ebs_volume",
  "AWS::EFS::FileSystem": "aws_efs_file_system",
  "AWS::EFS::MountTarget": "aws_efs_mount_target",
  "AWS::EFS::AccessPoint": "aws_efs_access_point",

  // ---- Networking ------------------------------------------------------
  "AWS::EC2::VPC": "aws_vpc",
  "AWS::EC2::Subnet": "aws_subnet",
  "AWS::EC2::InternetGateway": "aws_internet_gateway",
  "AWS::EC2::VPCGatewayAttachment": "aws_internet_gateway_attachment",
  "AWS::EC2::NatGateway": "aws_nat_gateway",
  "AWS::EC2::RouteTable": "aws_route_table",
  "AWS::EC2::Route": "aws_route",
  "AWS::EC2::SubnetRouteTableAssociation": "aws_route_table_association",
  "AWS::EC2::SecurityGroup": "aws_security_group",
  "AWS::EC2::SecurityGroupIngress": "aws_security_group_rule",
  "AWS::EC2::SecurityGroupEgress": "aws_security_group_rule",
  "AWS::EC2::NetworkAcl": "aws_network_acl",
  "AWS::EC2::NetworkAclEntry": "aws_network_acl_rule",
  "AWS::EC2::VPCEndpoint": "aws_vpc_endpoint",
  "AWS::EC2::VPCPeeringConnection": "aws_vpc_peering_connection",
  "AWS::EC2::TransitGateway": "aws_ec2_transit_gateway",
  "AWS::EC2::FlowLog": "aws_flow_log",

  // ---- Load balancing & DNS --------------------------------------------
  "AWS::ElasticLoadBalancingV2::LoadBalancer": "aws_lb",
  "AWS::ElasticLoadBalancingV2::TargetGroup": "aws_lb_target_group",
  "AWS::ElasticLoadBalancingV2::Listener": "aws_lb_listener",
  "AWS::ElasticLoadBalancingV2::ListenerRule": "aws_lb_listener_rule",
  "AWS::ElasticLoadBalancing::LoadBalancer": "aws_elb",
  "AWS::Route53::HostedZone": "aws_route53_zone",
  "AWS::Route53::RecordSet": "aws_route53_record",
  "AWS::Route53::RecordSetGroup": "aws_route53_record", // agent will expand to many aws_route53_record blocks
  "AWS::CloudFront::Distribution": "aws_cloudfront_distribution",
  "AWS::CloudFront::OriginAccessControl": "aws_cloudfront_origin_access_control",
  "AWS::CloudFront::CachePolicy": "aws_cloudfront_cache_policy",

  // ---- IAM / Security --------------------------------------------------
  "AWS::IAM::Role": "aws_iam_role",
  "AWS::IAM::Policy": "aws_iam_policy",
  "AWS::IAM::ManagedPolicy": "aws_iam_policy",
  "AWS::IAM::InstanceProfile": "aws_iam_instance_profile",
  "AWS::IAM::User": "aws_iam_user",
  "AWS::IAM::Group": "aws_iam_group",
  "AWS::IAM::AccessKey": "aws_iam_access_key",
  "AWS::IAM::RolePolicy": "aws_iam_role_policy",
  "AWS::KMS::Key": "aws_kms_key",
  "AWS::KMS::Alias": "aws_kms_alias",
  "AWS::SecretsManager::Secret": "aws_secretsmanager_secret",
  "AWS::SecretsManager::SecretTargetAttachment": "aws_secretsmanager_secret_rotation",
  "AWS::CertificateManager::Certificate": "aws_acm_certificate",
  "AWS::WAFv2::WebACL": "aws_wafv2_web_acl",
  "AWS::WAFv2::WebACLAssociation": "aws_wafv2_web_acl_association",

  // ---- Databases -------------------------------------------------------
  "AWS::RDS::DBInstance": "aws_db_instance",
  "AWS::RDS::DBCluster": "aws_rds_cluster",
  "AWS::RDS::DBClusterInstance": "aws_rds_cluster_instance",
  "AWS::RDS::DBSubnetGroup": "aws_db_subnet_group",
  "AWS::RDS::DBParameterGroup": "aws_db_parameter_group",
  "AWS::RDS::DBClusterParameterGroup": "aws_rds_cluster_parameter_group",
  "AWS::DynamoDB::Table": "aws_dynamodb_table",
  "AWS::ElastiCache::CacheCluster": "aws_elasticache_cluster",
  "AWS::ElastiCache::ReplicationGroup": "aws_elasticache_replication_group",
  "AWS::ElastiCache::SubnetGroup": "aws_elasticache_subnet_group",
  "AWS::Redshift::Cluster": "aws_redshift_cluster",

  // ---- Serverless / Integration ----------------------------------------
  "AWS::Lambda::Function": "aws_lambda_function",
  "AWS::Lambda::Permission": "aws_lambda_permission",
  "AWS::Lambda::EventSourceMapping": "aws_lambda_event_source_mapping",
  "AWS::Lambda::Alias": "aws_lambda_alias",
  "AWS::Lambda::Version": "aws_lambda_function", // version is implicit on aws_lambda_function
  "AWS::Lambda::LayerVersion": "aws_lambda_layer_version",
  "AWS::ApiGateway::RestApi": "aws_api_gateway_rest_api",
  "AWS::ApiGateway::Resource": "aws_api_gateway_resource",
  "AWS::ApiGateway::Method": "aws_api_gateway_method",
  "AWS::ApiGateway::Integration": "aws_api_gateway_integration",
  "AWS::ApiGateway::Deployment": "aws_api_gateway_deployment",
  "AWS::ApiGateway::Stage": "aws_api_gateway_stage",
  "AWS::ApiGatewayV2::Api": "aws_apigatewayv2_api",
  "AWS::ApiGatewayV2::Integration": "aws_apigatewayv2_integration",
  "AWS::ApiGatewayV2::Route": "aws_apigatewayv2_route",
  "AWS::ApiGatewayV2::Stage": "aws_apigatewayv2_stage",
  "AWS::SNS::Topic": "aws_sns_topic",
  "AWS::SNS::Subscription": "aws_sns_topic_subscription",
  "AWS::SNS::TopicPolicy": "aws_sns_topic_policy",
  "AWS::SQS::Queue": "aws_sqs_queue",
  "AWS::SQS::QueuePolicy": "aws_sqs_queue_policy",
  "AWS::Events::Rule": "aws_cloudwatch_event_rule",
  "AWS::Events::EventBus": "aws_cloudwatch_event_bus",
  "AWS::StepFunctions::StateMachine": "aws_sfn_state_machine",
  "AWS::StepFunctions::Activity": "aws_sfn_activity",
  "AWS::Kinesis::Stream": "aws_kinesis_stream",
  "AWS::KinesisFirehose::DeliveryStream": "aws_kinesis_firehose_delivery_stream",

  // ---- Containers ------------------------------------------------------
  "AWS::ECS::Cluster": "aws_ecs_cluster",
  "AWS::ECS::Service": "aws_ecs_service",
  "AWS::ECS::TaskDefinition": "aws_ecs_task_definition",
  "AWS::ECS::CapacityProvider": "aws_ecs_capacity_provider",
  "AWS::ECR::Repository": "aws_ecr_repository",
  "AWS::ECR::LifecyclePolicy": "aws_ecr_lifecycle_policy",
  "AWS::EKS::Cluster": "aws_eks_cluster",
  "AWS::EKS::Nodegroup": "aws_eks_node_group",
  "AWS::EKS::FargateProfile": "aws_eks_fargate_profile",

  // ---- Observability ---------------------------------------------------
  "AWS::Logs::LogGroup": "aws_cloudwatch_log_group",
  "AWS::Logs::LogStream": "aws_cloudwatch_log_stream",
  "AWS::Logs::MetricFilter": "aws_cloudwatch_log_metric_filter",
  "AWS::Logs::SubscriptionFilter": "aws_cloudwatch_log_subscription_filter",
  "AWS::CloudWatch::Alarm": "aws_cloudwatch_metric_alarm",
  "AWS::CloudWatch::Dashboard": "aws_cloudwatch_dashboard",
  "AWS::XRay::SamplingRule": "aws_xray_sampling_rule",

  // ---- Nested stacks (no direct equivalent) ----------------------------
  // AWS::CloudFormation::Stack — the agent emits a comment recommending that
  // the user factor the nested template into a Terraform module manually.
  "AWS::CloudFormation::Stack": null,
  "AWS::CloudFormation::Macro": null,
  "AWS::CloudFormation::CustomResource": null,
};

/**
 * Stable set of the most useful AWS data sources for CF-style lookups —
 * the system prompt references these when translating pseudo-parameters
 * like `AWS::AccountId`, `AWS::Region`, `AWS::Partition`, `AWS::URLSuffix`.
 */
export const AWS_DATA_SOURCES = {
  accountId: 'data.aws_caller_identity.current.account_id',
  region: 'data.aws_region.current.name',
  partition: 'data.aws_partition.current.partition',
  urlSuffix: 'data.aws_partition.current.dns_suffix',
  azs: 'data.aws_availability_zones.available.names',
} as const;
