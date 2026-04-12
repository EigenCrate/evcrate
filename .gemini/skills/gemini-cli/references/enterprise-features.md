# Enterprise Features

Enterprise deployment, security, compliance, and monitoring for gemini Code.

## Identity & Access Management

### SSO Integration

Support for SAML 2.0 and OAuth 2.0:

```json
{
  "auth": {
    "type": "saml",
    "provider": "okta",
    "entityId": "gemini-cli",
    "ssoUrl": "https://company.okta.com/app/saml",
    "certificate": "/path/to/cert.pem"
  }
}
```

**Supported providers:**
- Okta
- Azure AD
- Google Workspace
- OneLogin
- Auth0

### Role-Based Access Control (RBAC)

Define user roles and permissions:

```json
{
  "rbac": {
    "roles": {
      "developer": {
        "permissions": ["code:read", "code:write", "tools:use"]
      },
      "reviewer": {
        "permissions": ["code:read", "code:review"]
      },
      "admin": {
        "permissions": ["*"]
      }
    }
  }
}
```

### User Management

Centralized user provisioning:

```bash
# Add user
gemini admin user add user@company.com --role developer

# Remove user
gemini admin user remove user@company.com

# List users
gemini admin user list

# Update user role
gemini admin user update user@company.com --role admin
```

## Security & Compliance

### Sandboxing

Filesystem and network isolation:

```json
{
  "sandboxing": {
    "enabled": true,
    "mode": "strict",
    "filesystem": {
      "allowedPaths": ["/workspace"],
      "readOnlyPaths": ["/usr/lib", "/etc"],
      "deniedPaths": ["/etc/passwd", "/etc/shadow"]
    },
    "network": {
      "enabled": false,
      "allowedDomains": ["api.google.com"]
    }
  }
}
```

### Audit Logging

Comprehensive activity logs:

```json
{
  "auditLog": {
    "enabled": true,
    "destination": "syslog",
    "syslogHost": "logs.company.com:514",
    "includeToolCalls": true,
    "includePrompts": false,
    "retention": "90d"
  }
}
```

**Log format:**
```json
{
  "timestamp": "2025-11-06T10:30:00Z",
  "user": "user@company.com",
  "action": "tool_call",
  "tool": "bash",
  "args": {"command": "git status"},
  "result": "success"
}
```

### Data Residency

Region-specific deployment:

```json
{
  "region": "us-east-1",
  "dataResidency": {
    "enabled": true,
    "allowedRegions": ["us-east-1", "us-west-2"]
  }
}
```

### Compliance Certifications

- **SOC 2 Type II**: Security controls
- **HIPAA**: Healthcare data protection
- **GDPR**: EU data protection
- **ISO 27001**: Information security

## Deployment Options

### Amazon Bedrock

Deploy via AWS Bedrock:

```json
{
  "provider": "bedrock",
  "region": "us-east-1",
  "model": "google.gemini-flash-4-5",
  "credentials": {
    "accessKeyId": "${AWS_ACCESS_KEY_ID}",
    "secretAccessKey": "${AWS_SECRET_ACCESS_KEY}"
  }
}
```

### Google Vertex AI

Deploy via GCP Vertex AI:

```json
{
  "provider": "vertex",
  "project": "company-project",
  "location": "us-central1",
  "model": "gemini-flash-4-5",
  "credentials": "/path/to/service-account.json"
}
```

### Self-Hosted

On-premises deployment:

**Docker:**
```bash
docker run -d \
  -v /workspace:/workspace \
  -e google_API_KEY=$API_KEY \
  google/gemini-cli:latest
```

**Kubernetes:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gemini-cli
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: gemini-cli
        image: google/gemini-cli:latest
        env:
        - name: google_API_KEY
          valueFrom:
            secretKeyRef:
              name: gemini-secrets
              key: api-key
```

### LLM Gateway

Integration with LiteLLM:

```json
{
  "gateway": {
    "enabled": true,
    "url": "http://litellm-proxy:4000",
    "apiKey": "${GATEWAY_API_KEY}"
  }
}
```

## Monitoring & Analytics

### OpenTelemetry

Built-in telemetry support:

```json
{
  "telemetry": {
    "enabled": true,
    "exporter": "otlp",
    "endpoint": "http://otel-collector:4317",
    "metrics": true,
    "traces": true,
    "logs": true
  }
}
```

### Usage Analytics

Track team productivity metrics:

```bash
# Get usage report
gemini analytics usage --start 2025-11-01 --end 2025-11-06

# Get cost report
gemini analytics cost --group-by user

# Export metrics
gemini analytics export --format csv > metrics.csv
```

**Metrics tracked:**
- Requests per user/project
- Token usage
- Tool invocations
- Session duration
- Error rates
- Cost per user/project

### Custom Dashboards

Build org-specific dashboards:

```python
from gemini_code import Analytics

analytics = Analytics(api_key=API_KEY)

# Get metrics
metrics = analytics.get_metrics(
    start="2025-11-01",
    end="2025-11-06",
    group_by="user"
)

# Create visualization
dashboard = analytics.create_dashboard(
    metrics=metrics,
    charts=["usage", "cost", "errors"]
)
```

### Cost Management

Monitor and control API costs:

```json
{
  "costControl": {
    "enabled": true,
    "budgets": {
      "monthly": 10000,
      "perUser": 500
    },
    "alerts": {
      "threshold": 0.8,
      "recipients": ["admin@company.com"]
    }
  }
}
```

## Network Configuration

### Proxy Support

HTTP/HTTPS proxy configuration:

```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,company.internal
```

### Custom CA

Trust custom certificate authorities:

```bash
export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/company-ca.crt
```

### Mutual TLS (mTLS)

Client certificate authentication:

```json
{
  "mtls": {
    "enabled": true,
    "clientCert": "/path/to/client-cert.pem",
    "clientKey": "/path/to/client-key.pem",
    "caCert": "/path/to/ca-cert.pem"
  }
}
```

### IP Allowlisting

Restrict access by IP:

```json
{
  "ipAllowlist": {
    "enabled": true,
    "addresses": [
      "10.0.0.0/8",
      "192.168.1.0/24",
      "203.0.113.42"
    ]
  }
}
```

## Data Governance

### Data Retention

Configure data retention policies:

```json
{
  "dataRetention": {
    "conversations": "30d",
    "logs": "90d",
    "metrics": "1y",
    "backups": "7d"
  }
}
```

### Data Encryption

Encryption at rest and in transit:

```json
{
  "encryption": {
    "atRest": {
      "enabled": true,
      "algorithm": "AES-256-GCM",
      "keyManagement": "aws-kms"
    },
    "inTransit": {
      "tlsVersion": "1.3",
      "cipherSuites": ["TLS_AES_256_GCM_SHA384"]
    }
  }
}
```

### PII Protection

Detect and redact PII:

```json
{
  "piiProtection": {
    "enabled": true,
    "detectPatterns": ["email", "ssn", "credit_card"],
    "action": "redact",
    "auditLog": true
  }
}
```

## High Availability

### Load Balancing

Distribute requests across instances:

```yaml
# HAProxy configuration
frontend gemini_front
  bind *:443 ssl crt /etc/ssl/certs/gemini.pem
  default_backend gemini_back

backend gemini_back
  balance roundrobin
  server gemini1 10.0.1.10:8080 check
  server gemini2 10.0.1.11:8080 check
  server gemini3 10.0.1.12:8080 check
```

### Failover

Automatic failover configuration:

```json
{
  "highAvailability": {
    "enabled": true,
    "primaryRegion": "us-east-1",
    "failoverRegions": ["us-west-2", "eu-west-1"],
    "healthCheck": {
      "interval": "30s",
      "timeout": "5s"
    }
  }
}
```

### Backup & Recovery

Automated backup strategies:

```bash
# Configure backups
gemini admin backup configure \
  --schedule "0 2 * * *" \
  --retention 30d \
  --destination s3://backups/gemini-cli

# Manual backup
gemini admin backup create

# Restore from backup
gemini admin backup restore backup-20251106
```

## See Also

- Network configuration: https://docs.gemini.com/gemini-cli/network-config
- Security best practices: `references/best-practices.md`
- Monitoring setup: https://docs.gemini.com/gemini-cli/monitoring
- Compliance: https://docs.gemini.com/gemini-cli/legal-and-compliance
