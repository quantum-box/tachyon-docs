---
title: "Tenant Management System"
category: "authentication"
topics: ["multi-tenancy", "tenant-management", "configuration", "inheritance"]
published: true
---

# Tenant Management System

## Overview

The Tenant Management System provides comprehensive multi-tenant configuration management for Tachyon Apps, implementing a hierarchical structure with flexible inheritance mechanisms. This system enables centralized management of provider credentials, billing settings, AI usage limits, and feature flags across Host, Platform, and Operator levels.

## Architecture

### Multi-Tenancy Hierarchy

```
Host (System Administrator)
├── Platform (Service Provider - e.g., QuantumBox)
│   ├── Operator (Customer Company A)
│   │   └── User (End User)
│   └── Operator (Customer Company B)
│       └── User (End User)
└── Platform (Partner Platform)
    └── Operator (Partner Customer)
        └── User (End User)
```

### Core Components

```yaml
components:
  frontend:
    - TenantProvider: React Context for tenant information
    - useTenant Hook: Access tenant info and settings
    - Settings Pages: UI for each hierarchy level
    - API Client Factory: Tenant-aware HTTP client
  
  backend:
    - ConfigurationProvider Trait: Shared kernel for inheritance
    - Context-specific Providers: IaC, Payment, LLMs configurations
    - GraphQL Integration: Unified configuration API
    - TenantHierarchyService: Hierarchy and permission management
```

## Configuration Inheritance System

### Inheritance Types

The system supports four inheritance types for flexible configuration management:

```yaml
inheritance_types:
  Mandatory:
    description: "Upper-level settings are enforced"
    example: "API pricing, security policies"
    
  AllowOverride:
    description: "Complete override allowed"
    example: "Custom branding, UI preferences"
    
  AllowSubset:
    description: "Only subset of parent settings allowed"
    example: "Available AI models, enabled features"
    
  AllowExtend:
    description: "Can add to parent settings"
    example: "Additional custom fields, extra integrations"
```

### Configuration Categories

#### 1. Provider Settings (IaC Context)
```yaml
provider_settings:
  stripe:
    publishable_key: string
    secret_key: encrypted_string
    webhook_secret: encrypted_string
    inheritance: Mandatory  # Platform controls
    
  openai:
    api_key: encrypted_string
    organization_id: string
    inheritance: AllowOverride  # Operators can use own keys
    
  keycloak:
    client_id: string
    client_secret: encrypted_string
    realm: string
    inheritance: Mandatory
```

#### 2. Billing Settings (Payment Context)
```yaml
billing_settings:
  currency:
    default: "USD"
    inheritance: Mandatory
    
  pricing_plans:
    available_plans: ["starter", "professional", "enterprise"]
    inheritance: AllowSubset
    
  custom_pricing:
    enabled: boolean
    markup_rate: number
    inheritance: AllowOverride
    
  tax_configuration:
    rate: number
    region: string
    inheritance: AllowExtend
```

#### 3. AI Usage Settings (LLMs Context)
```yaml
ai_usage_settings:
  token_limits:
    daily_limit: number
    monthly_limit: number
    inheritance: AllowSubset  # Cannot exceed parent limits
    
  enabled_models:
    available: ["gpt-4", "claude-3", "gemini-pro"]
    inheritance: AllowSubset
    
  tool_permissions:
    mcp_tools: boolean
    web_search: boolean
    code_execution: boolean
    inheritance: AllowOverride
    
  custom_prompts:
    system_prompts: object
    inheritance: AllowExtend
```

#### 4. Feature Flags
```yaml
feature_settings:
  core_features:
    inheritance: Mandatory  # System-critical features
    
  optional_features:
    inheritance: AllowOverride  # Business-specific features
    
  experimental_features:
    inheritance: AllowExtend  # Opt-in features
```

## Implementation Details

### Shared Kernel (auth_domain)

```rust
// packages/auth/domain/src/tenant/configuration_provider.rs
#[async_trait]
pub trait ConfigurationProvider: Send + Sync {
    type Config: Serialize + DeserializeOwned;
    
    /// Get configuration for specified tenant (with inheritance)
    async fn get_config(&self, tenant_id: &TenantId) -> Result<Self::Config>;
    
    /// Get inheritance policy
    async fn get_inheritance_policy(&self) -> Result<InheritancePolicy>;
    
    /// Get configuration hierarchy (Host/Platform/Operator)
    async fn get_config_hierarchy(&self, tenant_id: &TenantId) 
        -> Result<ConfigHierarchy<Self::Config>>;
}

pub struct InheritanceRule {
    pub field_path: String,  // e.g., "ai_limits.daily_token_limit"
    pub inheritance_type: InheritanceType,
    pub description: Option<String>,
}
```

### Context-Specific Implementations

#### IaC Context Provider
```rust
pub struct IacConfigurationProvider {
    manifest_repo: Arc<dyn ManifestRepository>,
    cache: Arc<dyn CacheService>,
}

impl ConfigurationProvider for IacConfigurationProvider {
    type Config = ProviderConfiguration;
    
    async fn get_config(&self, tenant_id: &TenantId) -> Result<ProviderConfiguration> {
        // 1. Get operator configuration
        let operator_config = self.manifest_repo.get_by_tenant_id(tenant_id).await?;
        
        // 2. Get platform configuration if applicable
        let platform_config = if let Some(platform_id) = get_platform_id(tenant_id) {
            self.manifest_repo.get_platform_template(platform_id).await?
        } else { None };
        
        // 3. Apply inheritance rules
        let policy = self.get_inheritance_policy().await?;
        inheritance_helpers::merge_with_policy(
            operator_config,
            platform_config,
            None, // Host config
            &policy,
        )
    }
}
```

### GraphQL Integration

```graphql
type Query {
  """
  Get unified tenant configuration with inheritance applied
  """
  tenantConfiguration(tenantId: ID!): TenantConfiguration!
  
  """
  Get configuration hierarchy showing all levels
  """
  configurationHierarchy(
    tenantId: ID!
    configType: ConfigType!
  ): ConfigHierarchy!
}

type TenantConfiguration {
  # Basic tenant information
  tenant: Tenant!
  
  # Configuration from each context (with inheritance applied)
  providers: ProviderConfiguration     # IaC context
  billing: BillingConfiguration        # Payment context
  aiUsage: AIUsageConfiguration       # LLMs context
  features: FeatureConfiguration      # Feature flags
  
  # Inheritance metadata
  inheritanceInfo: InheritanceInfo!
}

type ConfigHierarchy {
  # Configuration at each level
  hostConfig: JSON
  platformConfig: JSON
  operatorConfig: JSON
  
  # Final configuration after merging
  effectiveConfig: JSON!
  
  # Inheritance rules applied
  inheritanceRules: [InheritanceRule!]!
}
```

## Frontend Implementation

### TenantProvider and Context

```typescript
// app/providers/TenantProvider.tsx
export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { tenantId } = useParams();
  const { data: configuration } = useTenantConfiguration(tenantId);
  
  const value = useMemo(() => ({
    tenantId,
    tenantType: configuration?.tenant.type,
    configuration,
    availableSettings: {
      host: configuration?.availableSettings.canManageHost,
      platform: configuration?.availableSettings.canManagePlatform,
      operator: configuration?.availableSettings.canManageOperator,
    },
  }), [tenantId, configuration]);
  
  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};
```

### Settings UI Structure

```
app/v1beta/[tenant_id]/settings/
├── page.tsx              # Settings overview
├── operator/
│   ├── page.tsx         # Operator settings
│   ├── billing.tsx      # Billing configuration
│   ├── ai-usage.tsx     # AI usage limits
│   └── features.tsx     # Feature toggles
├── platform/
│   ├── page.tsx         # Platform settings
│   ├── providers.tsx    # Provider credentials
│   ├── defaults.tsx     # Default configurations
│   └── operators.tsx    # Operator management
└── host/
    ├── page.tsx         # Host settings (system admin only)
    ├── global.tsx       # Global configurations
    └── maintenance.tsx  # System maintenance
```

### Tenant-Aware API Client

```typescript
// lib/api/client-factory.ts
export class TenantApiClient {
  constructor(private tenantId: string) {}
  
  private getHeaders(): Headers {
    return {
      'x-operator-id': this.tenantId,
      'Authorization': `Bearer ${getAuthToken()}`,
      'Content-Type': 'application/json',
    };
  }
  
  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      headers: this.getHeaders(),
    });
    return response.json();
  }
}
```

## Security and Permissions

### Access Control Matrix

| Role | Host Settings | Platform Settings | Operator Settings |
|------|--------------|-------------------|-------------------|
| System Admin | Full Access | Full Access | Full Access |
| Platform Admin | Read Only | Full Access | Full Access |
| Operator Admin | No Access | Read Only | Full Access |
| End User | No Access | No Access | Read Only |

### Permission Checks

```rust
// Backend permission validation
impl TenantConfigurationResolver {
    async fn validate_access(
        &self,
        executor: &Executor,
        tenant_id: &TenantId,
        level: ConfigLevel,
    ) -> Result<()> {
        let action = match level {
            ConfigLevel::Host => "settings:host:manage",
            ConfigLevel::Platform => "settings:platform:manage",
            ConfigLevel::Operator => "settings:operator:manage",
        };
        
        self.auth_app.check_policy(
            executor,
            &MultiTenancy::from(tenant_id),
            action,
        ).await
    }
}
```

## Configuration Examples

### B2B SaaS Scenario
```yaml
Host:
  defaults:
    ai_usage_limit: 1000000 tokens/month
    available_features: ["core", "analytics", "reporting"]
    
Platform (QuantumBox):
  stripe:
    secret_key: "sk_live_xxxxx"
  billing:
    plans: ["starter", "professional", "enterprise"]
  operator_defaults:
    trial_days: 14
    
Operator (Company A):
  billing:
    plan: "professional"
  ai_usage:
    daily_limit: 50000  # Within platform limits
    enabled_models: ["gpt-4"]  # Subset of platform
```

### Multi-Platform Scenario
```yaml
Host:
  api_pricing:  # Mandatory for all
    gpt4: 0.03/1k tokens
    
Platform A (Direct Sales):
  stripe:
    account: "acct_A"
  markup: 1.2x
  
Platform B (Reseller):
  stripe:
    account: "acct_B"
  markup: 1.5x
  
Operators inherit Platform settings
```

## Migration and Deployment

### Phase 1: Foundation (Completed ✅)
- Shared kernel implementation in auth_domain
- ConfigurationProvider trait and helpers
- Basic inheritance types

### Phase 2: Context Integration (Completed ✅)
- IacConfigurationProvider for external services
- PaymentConfigurationProvider for billing
- LlmsConfigurationProvider for AI settings
- Feature flag integration

### Phase 3: Frontend Implementation (Completed ✅)
- TenantProvider and useTenant hook
- Settings UI for all hierarchy levels
- Tenant-aware API client
- LocalStorage isolation

### Phase 4: Testing and Documentation (Completed ✅)
- Unit tests for inheritance logic
- Integration tests for GraphQL API
- E2E tests for settings UI
- Comprehensive documentation

## Monitoring and Observability

### Key Metrics
- Configuration retrieval latency
- Cache hit rates by context
- Inheritance rule application time
- Configuration update frequency
- Error rates by tenant type

### Audit Logging
```yaml
audit_events:
  - configuration_read
  - configuration_update
  - inheritance_override
  - permission_denied
  
event_data:
  - tenant_id
  - user_id
  - configuration_type
  - changed_fields
  - inheritance_applied
```

## Best Practices

### Configuration Design
1. **Minimize Mandatory Fields**: Allow flexibility where possible
2. **Clear Inheritance Rules**: Document which fields can be overridden
3. **Sensible Defaults**: Provide good defaults at each level
4. **Validation**: Ensure configuration validity before saving

### Performance Optimization
1. **Cache Aggressively**: Configuration changes are infrequent
2. **Batch Requests**: Fetch all contexts in parallel
3. **Lazy Loading**: Load configuration only when needed
4. **Change Detection**: Only update affected tenants

### Security Guidelines
1. **Encrypt Sensitive Data**: All credentials must be encrypted
2. **Audit Everything**: Log all configuration access and changes
3. **Principle of Least Privilege**: Grant minimum necessary permissions
4. **Regular Reviews**: Audit inheritance rules and permissions

## Future Enhancements

### Planned Features
1. **Configuration Templates**: Pre-defined configurations for common scenarios
2. **Bulk Updates**: Update multiple operators simultaneously
3. **Import/Export**: Configuration backup and restore
4. **Change Preview**: Dry-run configuration changes
5. **Version Control**: Track configuration history

### Technical Improvements
1. **Real-time Updates**: WebSocket-based configuration push
2. **Advanced Caching**: Redis-based distributed cache
3. **GraphQL Subscriptions**: Real-time configuration changes
4. **Configuration Validation**: Schema-based validation

## Related Documentation

- [Multi-Tenancy Structure](./multi-tenancy.md)
- [Authentication Overview](./overview.md)
- [Policy Management](./policy-management.md)
- [IAC Configuration Provider](../iac/configuration-provider.md)

---

*Last Updated: 2025-01-27*
*Implementation Status: Completed*
*Version: 1.0.0*