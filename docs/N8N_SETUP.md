# N8N Webhook Setup and Troubleshooting

## Overview

The Trip Planner application uses an N8N workflow to provide AI-powered trip insights via Google's Gemini API. The backend proxies requests to an N8N webhook for security and rate limiting.

## Configuration

### Environment Variable

Set the N8N webhook URL using the `N8N_WEBHOOK_URL` environment variable:

```bash
export N8N_WEBHOOK_URL="https://your-n8n-instance.com/webhook/your-webhook-path"
```

Or in your deployment configuration (Docker, Kubernetes, etc.):

```yaml
environment:
  - N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/your-webhook-path
```

### Optional Configuration

Adjust the webhook timeout (default is 30 seconds):

```properties
n8n.timeout.seconds=30
```

## Common Issues

### Issue: 404 Not Found - Webhook Not Registered

**Symptoms:**
```
N8N API error: 404 NOT_FOUND Not Found
{"code":404,"message":"The requested webhook \"route-planner-ai\" is not registered."}
```

**Root Cause:**
The N8N workflow is not activated or is still in test mode.

**Solution:**

1. **Log into N8N instance**: Access your N8N instance

2. **Locate the workflow**: Find the workflow with the webhook for trip planner AI insights

3. **Activate the workflow**:
   - Look for the "Inactive" toggle at the top of the workflow canvas
   - Switch it to "Active" (it should turn green)
   - This moves the workflow from test mode to production mode

4. **Verify webhook configuration**:
   - Click on the Webhook node in the workflow
   - Ensure the webhook path matches your N8N_WEBHOOK_URL configuration
   - The HTTP method should be: `POST`

5. **Save the workflow**: Click "Save" to persist your changes

6. **Test the webhook**:
   - Try the AI insights feature in the application
   - Check the application logs for success

### Issue: Webhook URL Not Configured

**Symptoms:**
```
N8N webhook URL is NOT configured!
AI insights functionality will be DISABLED
```

**Solution:**
Set the `N8N_WEBHOOK_URL` environment variable as described above.

### Issue: Connection Timeout

**Symptoms:**
```
Failed to proxy request to n8n
SocketTimeoutException: Read timed out
```

**Possible Causes:**
- N8N instance is down or unreachable
- Gemini API is slow or rate-limited
- Network connectivity issues

**Solutions:**
1. Check N8N instance status
2. Verify network connectivity from application server to N8N
3. Increase timeout if needed: `n8n.timeout.seconds=60`
4. Check N8N workflow logs for errors

## Health Check

The application includes a health indicator for the N8N webhook. Access it via:

```bash
curl https://your-app-domain/actuator/health
```

Look for the `n8nWebhook` component in the response:

```json
{
  "status": "UP",
  "components": {
    "n8nWebhook": {
      "status": "UP",
      "details": {
        "webhookUrl": "https://your-n8n-instance.com/***",
        "status": "CONFIGURED",
        "message": "N8N webhook is configured..."
      }
    }
  }
}
```

## N8N Workflow Setup

### Required Nodes

1. **Webhook Node**:
   - Path: (set according to your N8N_WEBHOOK_URL)
   - Method: `POST`
   - Response Mode: "When Last Node Finishes"

2. **Function/Code Node** (optional):
   - Extract and validate the prompt from request body
   - Prepare payload for Gemini API

3. **HTTP Request Node**:
   - URL: Google Gemini API endpoint
   - Method: `POST`
   - Authentication: API Key
   - Body: JSON with the prompt

4. **Response Node**:
   - Format the Gemini API response
   - Return JSON to the application

### Example Workflow Structure

```
[Webhook] → [Validate Input] → [Call Gemini API] → [Format Response] → [Return]
```

## Deployment Checklist

When deploying the application:

- [ ] N8N instance is running and accessible
- [ ] N8N workflow is created and configured
- [ ] Webhook path matches the configuration
- [ ] Workflow is **ACTIVATED** (not in test mode)
- [ ] `N8N_WEBHOOK_URL` environment variable is set correctly
- [ ] Gemini API key is configured in N8N
- [ ] Network connectivity exists between application and N8N
- [ ] Test AI insights feature after deployment

## Monitoring

Monitor N8N webhook usage via:

1. **Application Logs**: Look for errors starting with "N8N API error"
2. **Health Endpoint**: Check `/actuator/health` for webhook status
3. **N8N Dashboard**: View execution history in N8N interface
4. **Database**: Query `ai_usage_logs` table for request/response statistics

## Security Notes

- The webhook URL is masked in logs to prevent exposure
- The backend proxies all requests to add rate limiting
- CSRF protection is disabled for `/api/ai/**` endpoints (webhook callbacks)
- Consider using API authentication for production N8N webhooks

## Support

If issues persist:

1. Check application logs for detailed error messages
2. Verify N8N workflow execution logs
3. Test the webhook directly using curl:

```bash
curl -X POST $N8N_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"message":"Test prompt","language":"en"}'
```

Expected response: JSON with AI-generated insights
