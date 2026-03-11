// ---------------------------------------------------------------------------
// Bicep -> Terraform/OpenTofu resource type mappings and property
// transformation rules.
//
// Ported from bicep_converter/mappings.py
//
// The agent uses lookup_resource_mapping to query these tables. For resources
// NOT in these tables the agent falls back to its own knowledge of the
// AzureRM provider.
// ---------------------------------------------------------------------------

/**
 * Bicep resource type (without API version) -> Terraform resource type.
 * `null` means the resource is merged into a parent or has no direct equivalent.
 */
export const RESOURCE_TYPE_MAP: Record<string, string | null> = {
  // Compute
  "Microsoft.Compute/virtualMachines": "azurerm_virtual_machine",
  "Microsoft.Compute/virtualMachineScaleSets":
    "azurerm_virtual_machine_scale_set",
  "Microsoft.Compute/disks": "azurerm_managed_disk",
  "Microsoft.Compute/availabilitySets": "azurerm_availability_set",
  "Microsoft.Compute/images": "azurerm_image",
  "Microsoft.Compute/proximityPlacementGroups":
    "azurerm_proximity_placement_group",

  // Storage
  "Microsoft.Storage/storageAccounts": "azurerm_storage_account",
  "Microsoft.Storage/storageAccounts/blobServices/containers":
    "azurerm_storage_container",
  "Microsoft.Storage/storageAccounts/fileServices/shares":
    "azurerm_storage_share",
  "Microsoft.Storage/storageAccounts/queueServices/queues":
    "azurerm_storage_queue",
  "Microsoft.Storage/storageAccounts/tableServices/tables":
    "azurerm_storage_table",

  // Networking
  "Microsoft.Network/virtualNetworks": "azurerm_virtual_network",
  "Microsoft.Network/virtualNetworks/subnets": "azurerm_subnet",
  "Microsoft.Network/networkSecurityGroups": "azurerm_network_security_group",
  "Microsoft.Network/networkSecurityGroups/securityRules":
    "azurerm_network_security_rule",
  "Microsoft.Network/publicIPAddresses": "azurerm_public_ip",
  "Microsoft.Network/loadBalancers": "azurerm_lb",
  "Microsoft.Network/applicationGateways": "azurerm_application_gateway",
  "Microsoft.Network/networkInterfaces": "azurerm_network_interface",
  "Microsoft.Network/privateDnsZones": "azurerm_private_dns_zone",
  "Microsoft.Network/privateEndpoints": "azurerm_private_endpoint",
  "Microsoft.Network/routeTables": "azurerm_route_table",
  "Microsoft.Network/natGateways": "azurerm_nat_gateway",
  "Microsoft.Network/dnsZones": "azurerm_dns_zone",
  "Microsoft.Network/frontDoors": "azurerm_frontdoor",

  // Web / App Service
  "Microsoft.Web/serverfarms": "azurerm_service_plan",
  "Microsoft.Web/sites": "azurerm_linux_web_app",
  "Microsoft.Web/sites/config": null, // Merged into parent resource
  "Microsoft.Web/staticSites": "azurerm_static_web_app",

  // Databases
  "Microsoft.Sql/servers": "azurerm_mssql_server",
  "Microsoft.Sql/servers/databases": "azurerm_mssql_database",
  "Microsoft.Sql/servers/firewallRules": "azurerm_mssql_firewall_rule",
  "Microsoft.DBforPostgreSQL/flexibleServers":
    "azurerm_postgresql_flexible_server",
  "Microsoft.DBforPostgreSQL/flexibleServers/databases":
    "azurerm_postgresql_flexible_server_database",
  "Microsoft.DBforMySQL/flexibleServers": "azurerm_mysql_flexible_server",
  "Microsoft.DocumentDB/databaseAccounts": "azurerm_cosmosdb_account",
  "Microsoft.Cache/redis": "azurerm_redis_cache",

  // Containers
  "Microsoft.ContainerService/managedClusters": "azurerm_kubernetes_cluster",
  "Microsoft.ContainerRegistry/registries": "azurerm_container_registry",
  "Microsoft.ContainerInstance/containerGroups": "azurerm_container_group",

  // Identity & Security
  "Microsoft.ManagedIdentity/userAssignedIdentities":
    "azurerm_user_assigned_identity",
  "Microsoft.KeyVault/vaults": "azurerm_key_vault",
  "Microsoft.KeyVault/vaults/secrets": "azurerm_key_vault_secret",
  "Microsoft.KeyVault/vaults/keys": "azurerm_key_vault_key",
  "Microsoft.KeyVault/vaults/accessPolicies": "azurerm_key_vault_access_policy",

  // Monitoring
  "Microsoft.Insights/components": "azurerm_application_insights",
  "Microsoft.OperationalInsights/workspaces":
    "azurerm_log_analytics_workspace",
  "Microsoft.Insights/diagnosticSettings":
    "azurerm_monitor_diagnostic_setting",
  "Microsoft.Insights/actionGroups": "azurerm_monitor_action_group",
  "Microsoft.Insights/metricAlerts": "azurerm_monitor_metric_alert",

  // Messaging
  "Microsoft.ServiceBus/namespaces": "azurerm_servicebus_namespace",
  "Microsoft.ServiceBus/namespaces/queues": "azurerm_servicebus_queue",
  "Microsoft.ServiceBus/namespaces/topics": "azurerm_servicebus_topic",
  "Microsoft.EventHub/namespaces": "azurerm_eventhub_namespace",
  "Microsoft.EventHub/namespaces/eventhubs": "azurerm_eventhub",

  // Resource Management
  "Microsoft.Resources/resourceGroups": "azurerm_resource_group",
  "Microsoft.Resources/deployments": null, // No direct equivalent
  "Microsoft.Authorization/roleAssignments": "azurerm_role_assignment",
  "Microsoft.Authorization/roleDefinitions": "azurerm_role_definition",
};

/**
 * Property transformations that require value decomposition.
 *
 * Key format: `"<bicep_resource_type>::<bicep_property_path>"`
 * Value: array of `[terraform_attribute, extraction_function_name]` tuples.
 */
export const PROPERTY_DECOMPOSITIONS: Record<
  string,
  Array<[string, string]>
> = {
  "Microsoft.Storage/storageAccounts::sku.name": [
    ["account_tier", "extract_storage_tier"],
    ["account_replication_type", "extract_storage_replication"],
  ],
  "Microsoft.Web/serverfarms::sku.name": [
    ["sku_name", "passthrough"],
  ],
};

/**
 * Non-obvious camelCase -> snake_case property-name overrides.
 */
export const PROPERTY_NAME_OVERRIDES: Record<string, string> = {
  storageAccountType: "storage_account_type",
  osDisk: "os_disk",
  imageReference: "source_image_reference",
  networkProfile: "network_interface_ids",
  hardwareProfile: "size",
  ipConfigurations: "ip_configuration",
  addressSpace: "address_space",
  addressPrefixes: "address_prefixes",
  enableHttpsTrafficOnly: "enable_https_traffic_only",
  minimumTlsVersion: "min_tls_version",
  allowBlobPublicAccess: "allow_nested_items_to_be_public",
  subnetId: "subnet_id",
  publicIPAddressId: "public_ip_address_id",
  networkSecurityGroupId: "network_security_group_id",
  dnsServers: "dns_servers",
  vmSize: "size",
  adminUsername: "admin_username",
  adminPassword: "admin_password",
  computerName: "computer_name",
};

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/** `"Standard_LRS"` -> `"Standard"`, `"Premium_LRS"` -> `"Premium"` */
export function extractStorageTier(skuName: string): string {
  return skuName.includes("_") ? skuName.split("_")[0] : skuName;
}

/** `"Standard_LRS"` -> `"LRS"`, `"Standard_GRS"` -> `"GRS"` */
export function extractStorageReplication(skuName: string): string {
  return skuName.includes("_") ? skuName.split("_")[1] : skuName;
}
