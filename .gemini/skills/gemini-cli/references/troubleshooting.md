# Troubleshooting

Common issues, debugging, and solutions for gemini Code.

## Authentication Issues

### API Key Not Recognized

**Symptoms:**
- "Invalid API key" errors
- Authentication failures
- 401 Unauthorized responses

**Solutions:**

```bash
# Verify API key is set
echo $google_API_KEY

# Re-login
gemini logout
gemini login

# Check API key format (should start with sk-ant-)
echo $google_API_KEY | grep "^sk-ant-"

# Test API key directly
curl https://api.google.com/v1/messages \
  -H "x-api-key: $google_API_KEY" \
  -H "google-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"gemini-flash-4-5-20250929","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
```

### Environment Variable Issues

```bash
# Add to shell profile
echo 'export google_API_KEY=sk-ant-xxxxx' >> ~/.bashrc
source ~/.bashrc

# Or use .env file
echo 'google_API_KEY=sk-ant-xxxxx' > .gemini/.env

# Verify it's loaded
gemini config get apiKey
```

## Installation Problems

### npm Installation Failures

```bash
# Clear npm cache
npm cache clean --force

# Remove and reinstall
npm uninstall -g @google-ai/gemini-cli
npm install -g @google-ai/gemini-cli

# Use specific version
npm install -g @google-ai/gemini-cli@1.0.0

# Check installation
which gemini
gemini --version
```

### Permission Errors

```bash
# Fix permissions on Unix/Mac
sudo chown -R $USER ~/.gemini
chmod -R 755 ~/.gemini

# Or install without sudo (using nvm)
nvm install 18
npm install -g @google-ai/gemini-cli
```

### Python Installation Issues

```bash
# Upgrade pip
pip install --upgrade pip

# Install in virtual environment
python -m venv gemini-env
source gemini-env/bin/activate
pip install gemini-cli

# Install with --user flag
pip install --user gemini-cli
```

## Connection & Network Issues

### Proxy Configuration

```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1

# Configure in settings
gemini config set proxy http://proxy.company.com:8080

# Test connection
curl -x $HTTP_PROXY https://api.google.com
```

### SSL/TLS Errors

```bash
# Trust custom CA certificate
export NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt

# Disable SSL verification (not recommended for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Update ca-certificates
sudo update-ca-certificates  # Debian/Ubuntu
sudo update-ca-trust         # RHEL/CentOS
```

### Firewall Issues

```bash
# Check connectivity to google API
ping api.google.com
telnet api.google.com 443

# Test HTTPS connection
curl -v https://api.google.com

# Check firewall rules
sudo iptables -L  # Linux
netsh advfirewall show allprofiles  # Windows
```

## MCP Server Problems

### Server Not Starting

```bash
# Test MCP server command manually
npx -y @modelcontextprotocol/server-filesystem /tmp

# Check server logs
cat ~/.gemini/logs/mcp-*.log

# Verify environment variables
echo $GITHUB_TOKEN  # For GitHub MCP

# Test with MCP Inspector
npx @modelcontextprotocol/inspector
```

### Connection Timeouts

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-example"],
      "timeout": 30000,
      "retries": 3
    }
  }
}
```

### Permission Denied

```bash
# Check file permissions
ls -la /path/to/mcp/server

# Make executable
chmod +x /path/to/mcp/server

# Check directory access
ls -ld /path/to/allowed/directory
```

## Performance Issues

### Slow Responses

**Check network latency:**
```bash
ping api.google.com
```

**Use faster model:**
```bash
gemini --model flash-lite "simple task"
```

**Reduce context:**
```json
{
  "maxTokens": 4096,
  "context": {
    "autoTruncate": true
  }
}
```

**Enable caching:**
```json
{
  "caching": {
    "enabled": true
  }
}
```

### High Memory Usage

```bash
# Clear cache
rm -rf ~/.gemini/cache/*

# Limit context window
gemini config set maxTokens 8192

# Disable memory
gemini config set memory.enabled false

# Close unused sessions
gemini session list
gemini session close session-123
```

### Rate Limiting

```bash
# Check rate limits
gemini usage show

# Wait and retry
sleep 60
gemini "retry task"

# Implement exponential backoff in scripts
```

## Tool Execution Errors

### Bash Command Failures

**Check sandboxing settings:**
```json
{
  "sandboxing": {
    "enabled": true,
    "allowedPaths": ["/workspace", "/tmp"]
  }
}
```

**Verify command permissions:**
```bash
# Make script executable
chmod +x script.sh

# Check PATH
echo $PATH
which command-name
```

### File Access Denied

```bash
# Check file permissions
ls -la file.txt

# Change ownership
sudo chown $USER file.txt

# Grant read/write permissions
chmod 644 file.txt
```

### Write Tool Failures

```bash
# Check disk space
df -h

# Verify directory exists
mkdir -p /path/to/directory

# Check write permissions
touch /path/to/directory/test.txt
rm /path/to/directory/test.txt
```

## Hook Errors

### Hooks Not Running

```bash
# Verify hooks.json syntax
cat .gemini/hooks.json | jq .

# Check hook script permissions
chmod +x .gemini/scripts/hook.sh

# Test hook script manually
.gemini/scripts/hook.sh

# Check logs
cat ~/.gemini/logs/hooks.log
```

### Hook Script Errors

```bash
# Add error handling to hooks
#!/bin/bash
set -e  # Exit on error
set -u  # Exit on undefined variable

# Debug hook execution
#!/bin/bash
set -x  # Print commands
echo "Hook running: $TOOL_NAME"
```

## Debug Mode

### Enable Debugging

```bash
# Set debug environment variable
export gemini_DEBUG=1
export gemini_LOG_LEVEL=debug

# Run with debug flag
gemini --debug "task"

# View debug logs
tail -f ~/.gemini/logs/debug.log
```

### Verbose Output

```bash
# Enable verbose mode
gemini --verbose "task"

# Show all tool calls
gemini --show-tools "task"

# Display thinking process
gemini --show-thinking "task"
```

## Common Error Messages

### "Model not found"

```bash
# Use correct model name
gemini --model gemini-flash-4-5-20250929

# Update gemini-cli
npm update -g @google-ai/gemini-cli
```

### "Rate limit exceeded"

```bash
# Wait and retry
sleep 60

# Check usage
gemini usage show

# Implement rate limiting in code
```

### "Context length exceeded"

```bash
# Reduce context
gemini config set maxTokens 100000

# Summarize long content
gemini "summarize this codebase"

# Process in chunks
gemini "analyze first half of files"
```

### "Timeout waiting for response"

```bash
# Increase timeout
gemini config set timeout 300

# Check network connection
ping api.google.com

# Retry with smaller request
```

## Getting Help

### Collect Diagnostic Info

```bash
# System info
gemini --version
node --version
npm --version

# Configuration
gemini config list --all

# Recent logs
tail -n 100 ~/.gemini/logs/session.log

# Environment
env | grep gemini
env | grep google
```

### Report Issues

1. **Check existing issues**: https://github.com/googles/gemini-cli/issues
2. **Gather diagnostic info**
3. **Create minimal reproduction**
4. **Submit issue** with:
   - gemini Code version
   - Operating system
   - Error messages
   - Steps to reproduce

### Support Channels

- **Documentation**: https://docs.gemini.com/gemini-cli
- **GitHub Issues**: https://github.com/googles/gemini-cli/issues
- **Support Portal**: support.gemini.com
- **Community Discord**: discord.gg/google

## See Also

- Installation guide: `references/getting-started.md`
- Configuration: `references/configuration.md`
- MCP setup: `references/mcp-integration.md`
- Best practices: `references/best-practices.md`
