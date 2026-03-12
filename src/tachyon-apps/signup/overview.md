# Signup System Overview

Tachyon Signup System provides a comprehensive user registration and workspace provisioning flow for new customers.

## Components

### [Self-Service Provisioning](./self-service-provisioning.md)
Automated system for provisioning new operators (tenants) with product assignment and instant software delivery.

### Cognito Integration  
AWS Cognito-based authentication system with:
- User registration and email verification
- Password management with secure requirements
- Session management and JWT tokens
- Custom UI implementation with NextAuth

### Signup Flow
Complete user journey from registration to workspace access:
1. Account creation with personal information
2. Email verification (6-digit code)
3. Workspace configuration
4. Automatic provisioning and redirect

## Related Documentation

- [Multi-Tenancy Architecture](../authentication/multi-tenancy.md)
- [Authentication System](../authentication/overview.md)
- [Payment Integration](../payment/overview.md)