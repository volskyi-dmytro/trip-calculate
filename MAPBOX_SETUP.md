# Mapbox Integration Guide

This document explains how to properly set up and troubleshoot Mapbox routing in the TripPlanner application.

## Overview

The application uses:
- **Backend**: Mapbox Directions API (for calculating road-based routes)
- **Frontend**: Leaflet (for displaying maps)

## How to Get a Mapbox Access Token

1. Go to [Mapbox](https://www.mapbox.com/)
2. Sign up for a free account (100,000 free requests/month)
3. Navigate to your [Account Dashboard](https://account.mapbox.com/)
4. Go to **Access Tokens** section
5. Create a new token or use the default public token
6. Copy the token (it should start with `pk.` for public or `sk.` for secret)

## Setting Up the Token

### For Local Development

Set the environment variable before running the application:

```bash
export MAPBOX_ACCESS_TOKEN="pk.your_token_here"
mvn spring-boot:run
```

Or in your IDE's run configuration.

### For Production (GitHub Secrets)

1. Go to your GitHub repository settings
2. Navigate to **Secrets and variables** → **Actions**
3. Add a new secret named `MAPBOX_ACCESS_TOKEN`
4. Paste your Mapbox token as the value

The deployment workflow (`.github/workflows/deploy-prod.yml`) already passes this to the Docker container.

## Token Format Validation

Valid Mapbox tokens must:
- Start with `pk.` (public token) or `sk.` (secret token)
- Be followed by a long alphanumeric string

Example: `pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbGV4YW1wbGUifQ.example_token_string`

## How Routing Works

1. **Primary**: Mapbox Directions API
   - Fast, reliable
   - 100,000 free requests/month
   - Falls back to OSRM if it fails

2. **Fallback**: OSRM (Open Source Routing Machine)
   - Free public servers
   - Can be slow or overloaded
   - Multiple servers for redundancy

3. **Last Resort**: Straight lines
   - If all routing services fail
   - Shows direct line between waypoints

## Troubleshooting

### Check the Logs

The application logs detailed information about routing:

```bash
# Check if token is loaded
grep "Mapbox routing enabled" logs/app.log

# Check for authentication errors
grep "AUTHENTICATION FAILED" logs/app.log

# Check for API errors
grep "Mapbox API error" logs/app.log
```

### Common Errors

#### 1. Token Not Set
**Error**: `MAPBOX_ACCESS_TOKEN not set`
**Solution**: Set the environment variable with your token

#### 2. Invalid Token Format
**Error**: `Invalid Mapbox token format!`
**Solution**: Ensure your token starts with `pk.` or `sk.`

#### 3. Authentication Failed (401)
**Error**: `AUTHENTICATION FAILED - Check your MAPBOX_ACCESS_TOKEN!`
**Solutions**:
- Verify the token is correct
- Check if the token hasn't been revoked
- Ensure no extra whitespace in the token

#### 4. Access Forbidden (403)
**Error**: `ACCESS FORBIDDEN - Your Mapbox token may not have permission for Directions API`
**Solutions**:
- Check token scopes in Mapbox dashboard
- Ensure Directions API is enabled for your token
- Verify your account is active

#### 5. Rate Limit Exceeded (429)
**Error**: `RATE LIMIT EXCEEDED - Too many Mapbox API requests`
**Solutions**:
- Wait a few minutes before trying again
- Consider upgrading your Mapbox plan
- Check if there's a loop causing excessive requests

#### 6. No Route Found
**Error**: `Mapbox could not find a route between the waypoints`
**Solutions**:
- Ensure waypoints are on or near roads
- Check coordinates are in correct format (latitude, longitude)
- Try different waypoints

## API Details

### Endpoint
```
https://api.mapbox.com/directions/v5/mapbox/driving/{coordinates}
```

### Parameters
- `access_token`: Your Mapbox access token (required)
- `geometries=geojson`: Return route geometry as GeoJSON
- `overview=full`: Include full route geometry
- `steps=false`: Disable turn-by-turn instructions (not needed)
- `alternatives=false`: Only return best route

### Response Format
The API returns:
- `distance`: Route distance in meters
- `duration`: Route duration in seconds
- `geometry`: GeoJSON LineString with route coordinates

## Testing Mapbox Integration

### Test API Directly

Replace `YOUR_TOKEN` with your actual token:

```bash
curl "https://api.mapbox.com/directions/v5/mapbox/driving/-122.42,37.78;-77.03,38.91?access_token=YOUR_TOKEN&geometries=geojson&overview=full"
```

Expected response:
```json
{
  "routes": [{
    "distance": 1234567.8,
    "duration": 12345.6,
    "geometry": {
      "coordinates": [...],
      "type": "LineString"
    }
  }],
  "code": "Ok"
}
```

### Test via Application

1. Start the application
2. Go to Route Planner
3. Add 2 or more waypoints on the map
4. Check browser console and backend logs
5. Look for "✅ Mapbox route found!" in logs

## Monitoring Usage

1. Visit [Mapbox Account Dashboard](https://account.mapbox.com/)
2. Check **Statistics** to see API usage
3. Monitor to avoid hitting free tier limits (100k requests/month)

## Documentation Resources

- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [Getting Access Tokens](https://docs.mapbox.com/help/getting-started/access-tokens/)
- [API Rate Limits](https://docs.mapbox.com/api/overview/#rate-limits)

## Alternative: Using Mapbox GL JS (Optional)

The current implementation uses Leaflet for map display. If you want to use Mapbox's own mapping library:

### Benefits
- Better integration with Mapbox services
- More styling options
- Better performance for complex maps

### Implementation
1. Install: `npm install mapbox-gl react-map-gl`
2. Replace Leaflet components with Mapbox GL JS
3. Update MapContainer component to use react-map-gl

This is optional and not required for routing to work.
