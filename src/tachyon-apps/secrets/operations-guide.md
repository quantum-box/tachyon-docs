# Secrets Context Operations Guide

## Overview

This guide covers operational procedures for managing secrets in production environments using AWS Secrets Manager.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Access to AWS Secrets Manager in the target region
- Database access for migration tasks

## AWS Secrets Manager Setup

### IAM Policy

The following IAM policy is required for the application:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:CreateSecret",
        "secretsmanager:PutSecretValue",
        "secretsmanager:DeleteSecret",
        "secretsmanager:ListSecrets",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:*"
    }
  ]
}
```

For production, restrict the `Resource` to specific secret prefixes:

```json
"Resource": [
  "arn:aws:secretsmanager:ap-northeast-1:ACCOUNT_ID:secret:tn_*",
  "arn:aws:secretsmanager:ap-northeast-1:ACCOUNT_ID:secret:global/*"
]
```

### Environment Separation

Secrets are separated by AWS account/region, not by naming convention:

| Environment | AWS Account | Region |
|-------------|-------------|--------|
| Production | prod-account | ap-northeast-1 |
| Staging | staging-account | ap-northeast-1 |
| Development | Local `.secrets.json` | N/A |

## Common Operations

### Adding a New Secret

#### Via AWS Console

1. Navigate to AWS Secrets Manager
2. Click "Store a new secret"
3. Select "Other type of secret"
4. Enter key-value pairs (JSON format):
   ```json
   {
     "api_key": "sk_live_xxx",
     "webhook_secret": "whsec_xxx"
   }
   ```
5. Name the secret using the path format:
   - Tenant provider: `tn_xxx/providers/stripe`
   - Global: `global/openai`

#### Via AWS CLI

```bash
# Create a new secret
aws secretsmanager create-secret \
  --name "tn_01hjryxysgey07h5jz5wagqj0m/providers/stripe" \
  --secret-string '{"api_key":"sk_live_xxx","webhook_secret":"whsec_xxx"}'

# Create a global secret
aws secretsmanager create-secret \
  --name "global/openai" \
  --secret-string '{"api_key":"sk-xxx"}'
```

### Updating a Secret

```bash
# Update existing secret
aws secretsmanager put-secret-value \
  --secret-id "tn_xxx/providers/stripe" \
  --secret-string '{"api_key":"sk_live_new_key","webhook_secret":"whsec_xxx"}'
```

> **Note**: After updating a secret, the application cache (5 min TTL) will expire automatically. For immediate effect, restart the application or trigger cache invalidation.

### Rotating a Secret

1. Create the new credential in the provider's dashboard
2. Update the secret in AWS:
   ```bash
   aws secretsmanager put-secret-value \
     --secret-id "tn_xxx/providers/stripe" \
     --secret-string '{"api_key":"sk_live_new_key"}'
   ```
3. Wait for cache expiration (5 minutes) or restart application
4. Revoke the old credential in the provider's dashboard

### Viewing Secret Metadata

```bash
# List all secrets
aws secretsmanager list-secrets --query "SecretList[].Name"

# List secrets for a tenant
aws secretsmanager list-secrets \
  --filter Key=name,Values="tn_01hjryxysgey07h5jz5wagqj0m"

# Describe a secret (without value)
aws secretsmanager describe-secret \
  --secret-id "tn_xxx/providers/stripe"
```

### Deleting a Secret

```bash
# Schedule deletion (default 7-day recovery window)
aws secretsmanager delete-secret \
  --secret-id "tn_xxx/providers/stripe"

# Immediate deletion (no recovery)
aws secretsmanager delete-secret \
  --secret-id "tn_xxx/providers/stripe" \
  --force-delete-without-recovery
```

## Migration Procedures

### Migrating Existing Data

Use the migration tool to migrate plain text secrets from database manifests to AWS Secrets Manager:

```bash
# Set environment
export DATABASE_URL="mysql://user:pass@host:3306/db"
export AWS_REGION="ap-northeast-1"

# Dry run first
cargo run -p iac --example secret_migration -- --dry-run tn_xxx

# Review the output, then execute
cargo run -p iac --example secret_migration -- tn_xxx
```

### Batch Migration

For migrating multiple tenants:

```bash
# Get all tenant IDs from database
mysql -e "SELECT DISTINCT tenant_id FROM manifests WHERE kind='ProjectConfig'" > tenants.txt

# Dry run all
for tenant in $(cat tenants.txt); do
  cargo run -p iac --example secret_migration -- --dry-run $tenant
done

# Execute migration
for tenant in $(cat tenants.txt); do
  cargo run -p iac --example secret_migration -- $tenant
done
```

### Rollback Procedure

If migration fails midway:

1. The migration is idempotent - re-running is safe
2. Secrets already in AWS Secrets Manager remain valid
3. Manifests not yet updated still have plain text (will be extracted on next save)

To manually restore a manifest:

```sql
-- View manifest content
SELECT manifest FROM manifests WHERE tenant_id = 'tn_xxx';

-- The manifest should contain $secret_ref format after migration
-- If needed, restore from backup
```

## Monitoring and Auditing

### CloudTrail Integration

All Secrets Manager API calls are automatically logged to CloudTrail. Key events:

- `GetSecretValue`: Secret access
- `CreateSecret`: New secret created
- `PutSecretValue`: Secret updated
- `DeleteSecret`: Secret deleted

### Application Logs

The application logs secret operations:

```
INFO secrets::usecase::get_secret: Getting secret secret_path=tn_xxx/providers/stripe
INFO secrets::usecase::get_secret: Secret retrieved successfully secret_path=tn_xxx/providers/stripe
```

To enable debug logging:

```bash
export RUST_LOG=secrets=debug,iac=debug
```

### Alerting

Set up CloudWatch alarms for:

1. **Access failures**: Filter CloudTrail for `GetSecretValue` with error status
2. **Unauthorized access**: Filter for denied IAM permissions
3. **Secret deletions**: Alert on `DeleteSecret` events

## Troubleshooting

### "ResourceNotFoundException" Error

The secret does not exist in AWS Secrets Manager.

**Resolution:**
1. Verify the secret path matches exactly (case-sensitive)
2. Create the secret if it doesn't exist
3. Check you're using the correct AWS region

### "AccessDeniedException" Error

IAM permissions are insufficient.

**Resolution:**
1. Verify the IAM role has `secretsmanager:GetSecretValue` permission
2. Check resource-level restrictions in the policy
3. Verify the role is correctly assumed

### Cache Stale Data

Application returns old secret value after update.

**Resolution:**
1. Wait 5 minutes for cache expiration
2. Restart the application to clear cache
3. For urgent updates, trigger cache invalidation programmatically

### Migration Tool Failures

**"Database connection failed":**
- Verify `DATABASE_URL` environment variable
- Check network connectivity to database

**"AWS credentials not found":**
- Configure AWS credentials via environment variables or IAM role
- Verify `AWS_REGION` is set

## Disaster Recovery

### Secret Backup

AWS Secrets Manager provides:
- Automatic versioning (last 10 versions retained)
- Recovery window for deleted secrets (default 7 days)

For additional backup:

```bash
# Export all secrets to encrypted file
aws secretsmanager list-secrets --query "SecretList[].Name" --output text | \
  xargs -I {} sh -c 'aws secretsmanager get-secret-value --secret-id {} --query SecretString --output text > {}.json'

# Encrypt the backup
tar czf secrets-backup.tar.gz *.json
gpg -c secrets-backup.tar.gz
rm *.json secrets-backup.tar.gz
```

### Secret Restoration

```bash
# Restore from previous version
aws secretsmanager get-secret-value \
  --secret-id "tn_xxx/providers/stripe" \
  --version-stage AWSPREVIOUS

# Or restore specific version
aws secretsmanager put-secret-value \
  --secret-id "tn_xxx/providers/stripe" \
  --secret-string "$(aws secretsmanager get-secret-value \
    --secret-id tn_xxx/providers/stripe \
    --version-id xxx \
    --query SecretString --output text)"
```

### Recovering Deleted Secret

Within the recovery window (default 7 days):

```bash
aws secretsmanager restore-secret \
  --secret-id "tn_xxx/providers/stripe"
```

## Cost Considerations

### Pricing

- $0.40 per secret per month
- $0.05 per 10,000 API calls

### Optimization

1. **Consolidate secrets**: Store multiple credentials in one secret per provider
2. **Use caching**: Application caches for 5 minutes, reducing API calls
3. **Clean up unused secrets**: Delete secrets for deprovisioned tenants

### Estimated Monthly Cost

| Scenario | Secrets | API Calls | Cost |
|----------|---------|-----------|------|
| 10 tenants, 2 providers | 20 | ~100K | $8.50 |
| 100 tenants, 3 providers | 300 | ~1M | $125 |

## Related Documentation

- [Developer Guide](developer-guide.md)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [CloudTrail User Guide](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/)
