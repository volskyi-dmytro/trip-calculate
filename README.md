# Trip Calculate

A modern full-stack web application for trip expense calculation and route planning, built with **React 19 + TypeScript** and **Spring Boot 3**.

**Live Demo:** [trip-calculate.online](https://trip-calculate.online)

## Recent Updates (v3.1)

- 🚗 **Car Garage** - Signed-in users save their cars (name, fuel type, real-world consumption) and mark a default; the default car pre-fills fuel consumption and fuel type in the route planner and quick calculator automatically
- 📖 **Car Catalog** - A built-in, offline catalog of 130+ car models popular in Ukraine with realistic mixed-cycle consumption per fuel variant (petrol / diesel / LPG), searchable in Ukrainian, Russian, and Latin spellings — no account needed
- 🤖 **AI Consumption Estimate** - Can't find your car in the catalog? Describe it in plain words ("Škoda Octavia A5 1.9 TDI 2006") and an AI estimate fills in fuel type and consumption (signed-in users, rate-limited and cached server-side)
- 🚙 **Vehicle-Class Presets** - Five one-tap consumption presets (city car → minivan) per fuel type for users who just don't know their numbers
- 💾 **Anonymous Car Memory** - The landing-page calculator remembers your last picked car in the browser, so returning visitors get their consumption pre-filled without an account
- 🔓 **Route Planner Open to Everyone** - The planner is out of beta: any Google account can build, save, and share routes (no access request needed)
- 🌍 **Locale-Prefixed URLs** - Bilingual SEO-friendly routing (`/en/...`, `/uk/...`) with server-side language detection, robots.txt, and sitemap

<details>
<summary>v3.0 highlights</summary>

- 🧠 **Multi-Agent Architecture** - The AI service is now a supervisor-orchestrated LangGraph: a supervisor classifies each request, then dispatches to a route/geocode agent and two deterministic, zero-LLM specialist agents (fuel, weather)
- ⛽ **Live Fuel Price Agent** - Country-average petrol/diesel/LPG prices, refreshed daily from EU Oil Bulletin, minfin.com.ua, and NBU (all keyless, no API cost); advisory only, never overwrites a manually entered price
- 🌦️ **Weather Agent** - Corridor forecast along the route for the trip's departure date (Open-Meteo, keyless), with risk flags for snow, heavy rain, strong wind, ice, and storms; departure date can be typed in chat or set with a picker
- 📡 **Streamed Agent Progress (SSE)** - Trip creation streams real per-agent progress (supervisor → route → geocoding → fuel → weather → compose) instead of a single request/response round trip, with a silent same-request fallback if streaming is unavailable
- ✨ **Concierge Result Card** - AI-created trips render as a card with stops, distance, driving time, live fuel cost, per-person split, and per-leg Waze navigation links
- 🗺️ **Waze Navigation Export** - One-tap turn-by-turn navigation for every leg of a route, from both the AI result card and the manual route panel
- 🔍 **Langfuse Observability** - Full LLM tracing with token counts, cost tracking, and session metadata per request
- 🗺️ **3D Map Visualization** - Mapbox GL with terrain and satellite views
- 💾 **Semantic Caching** - Redis-backed AI response caching with 24h TTL for faster results
- 🎨 **Neo-Travel Design** - Modern terminal-inspired interface with seasonal backgrounds
- 📊 **Admin Dashboard** - AI usage statistics and system monitoring
- 🌍 **Unicode Support** - Full Cyrillic and international character support in routes

</details>

## Features

### Trip Expense Calculator
- 💰 **Fuel Cost Calculation** - Calculate and split fuel costs among passengers
- 🧮 **Smart Cost Splitting** - Automatic per-person expense breakdown
- 🚗 **"Don't know your consumption?" Helper** - Pick your car from the catalog, use a class preset, or (signed in) get an AI estimate; the picked car is remembered in the browser
- 🔐 **Secure Authentication** - Google OAuth 2.0 with session persistence

### Car Garage & Consumption Helper
- 🏠 **My Cars** - A garage of up to 10 saved cars per user in the dashboard, each with name, fuel type (petrol / diesel / LPG), and consumption; one car is the default
- ⛽ **Default-Car Prefill** - The default car's consumption and fuel type pre-fill the route planner and quick calculator
- 📖 **Offline Car Catalog** - 130+ models common in Ukraine with realistic real-world consumption per engine variant, searchable in three scripts
- 🤖 **AI Estimate Endpoint** - `POST /api/cars/estimate` proxies a structured-output LLM call (per-user rate limits: 5/min, 20/hour; 24h response cache; strict 3.0–25.0 L/100km validation)

### AI-Powered Route Planner
- 🧠 **Supervisor + Specialist Agents** - A supervisor node classifies each request (create / modify / settings-only / off-topic) and routes it through a route-parsing agent, then the fuel and weather agents, all in one LangGraph graph
- 🤖 **Natural Language Parsing** - Type a route in plain text ("Kyiv to Lviv via Zhytomyr, leaving Saturday") and the agent extracts, normalizes, and geocodes all locations plus an optional departure date
- 📡 **Live Streamed Progress** - Watch the supervisor, route, geocoding, fuel, and weather agents complete in real time over Server-Sent Events as your trip is built
- ⛽ **Live Fuel Prices** - Country-average fuel prices attached to every AI-created route, refreshed daily, converted to your currency
- 🌦️ **Weather Along the Route** - Corridor forecast for the departure date at every stop, with risk flags (snow, heavy rain, strong wind, ice, storm) shown on the nearest stop
- 🗺️ **Per-Leg Waze Export** - Turn-by-turn navigation links for every leg of the trip
- 🔍 **Full LLM Observability** - Every AI request traced in Langfuse with token counts, cost, and session metadata
- 🗺️ **3D Map Visualization** - Mapbox-powered 3D terrain and satellite views
- 💾 **Semantic Caching** - Redis-backed AI response caching with 24h TTL
- 🛣️ **Road-Based Routing** - Multi-provider routing (Mapbox + OSRM fallback)
- 📍 **Geocoding** - Search locations and get addresses from coordinates
- 💾 **Cloud Storage** - Save and load routes with user authentication
- 🎯 **Manual Waypoints** - Add locations by address or map click, with the same live fuel price and weather data available to the manual flow
- ⛽ **Cost Estimation** - Real-time fuel cost calculation with caching
- 🔒 **Access Control** - Free for any Google account — sign in to build, save, and share routes

### General Features
- 🎨 **Neo-Travel Design** - Modern terminal-inspired interface with seasonal backgrounds
- 🌓 **Dark/Light Theme** - Seamless theme switching with persistence
- 🌍 **Bilingual Support** - Full English/Ukrainian localization
- 📱 **Fully Responsive** - Optimized for desktop, tablet, and mobile
- 🔔 **Toast Notifications** - Real-time user feedback with Sonner
- 📊 **Admin Dashboard** - AI usage statistics and user management
- 🐳 **Docker Ready** - Containerized deployment

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Tailwind CSS v4** - Modern utility-first styling
- **React Router v7** - Client-side routing
- **Mapbox GL JS** - 3D map visualization with terrain
- **Leaflet + React Leaflet** - Interactive 2D mapping
- **Vite 7** - Lightning-fast build tool
- **Axios** - HTTP client with smart caching
- **Sonner** - Toast notifications
- **Lucide React** - Icon system
- **Context API** - State management

### Backend
- **Spring Boot 3.3.2** (Java 17)
- **Spring Security + OAuth2** - Google authentication
- **Spring Data JPA** - Database abstraction
- **Spring Session JDBC** - Session persistence
- **Redis** - Semantic caching with 24h TTL
- **PostgreSQL** - Primary database (MySQL/H2 supported)
- **Spring Actuator + Prometheus** - Monitoring & metrics
- **Lombok** - Code generation

### AI Agent Service
- **Python 3.12** + **FastAPI** - HTTP API for the agent, with a streaming (SSE) endpoint alongside the sync one
- **LangGraph** - Supervisor-orchestrated graph: supervise → parse/geocode (with an LLM retry loop for failed locations) → fuel agent → weather agent → format. Fuel and weather are deterministic, zero-LLM specialist agents; the supervisor and route parser are the only LLM calls per trip
- **OpenAI gpt-4o-mini** - Structured output for supervisor classification, location extraction, and optional departure-date parsing
- **Nominatim** - Open-source geocoding with retry/backoff
- **Open-Meteo** - Keyless weather forecast API for the corridor weather agent
- **APScheduler** - Daily refresh of cached fuel prices and FX rates (EU Oil Bulletin, minfin.com.ua, NBU)
- **Langfuse** - LLM tracing and cost observability
- **httpx** - Async HTTP for Nominatim, Open-Meteo, and fuel-price source calls

## Architecture

### Single JAR Deployment
The application uses a **unified deployment model** where the React SPA is embedded into the Spring Boot JAR:

1. React frontend builds to `frontend/dist/`
2. Build artifacts copy to `src/main/resources/static/`
3. Spring Boot serves the SPA from classpath
4. Both frontend and backend run on **port 8080** (production)

**Benefits:**
- No CORS configuration needed
- Simplified deployment (single artifact)
- Consistent URL structure
- Easier reverse proxy setup

### Development Architecture
During development, Vite runs on port 3000 and proxies backend requests to Spring Boot on port 8080, enabling hot module replacement (HMR).

## Prerequisites

- **Java 17** or higher
- **Maven 3.6+**
- **Node.js 20+** with npm
- **Python 3.12+** with pip (for the AI agent service)
- **PostgreSQL 15** (or MySQL/H2 for local dev)
- **Docker** (optional, for containerized deployment)

## Local Development

### Option 1: Development Mode (Hot Reload)

**Terminal 1 - Start Backend:**
```bash
mvn spring-boot:run
```

**Terminal 2 - Start Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Access at: **http://localhost:3000**

**Terminal 3 - Start AI Agent (optional):**
```bash
cd agent
pip install -e ".[dev]"
OPENAI_API_KEY=sk-your_key uvicorn app.main:app --port 8001 --reload
```

The agent runs on port 8001. Spring Boot's `AGENT_URL` defaults to `http://localhost:8001` in development.

### Option 2: Production Build

```bash
# Build React frontend
cd frontend
npm run build

# Copy to Spring Boot static resources
cd ..
rm -rf src/main/resources/static/*
cp -r frontend/dist/* src/main/resources/static/

# Run Spring Boot
mvn spring-boot:run
```

Access at: **http://localhost:8080**

## Configuration

### Backend Configuration
Create `.env` file in project root:

```env
# Database
DATABASE_URL=jdbc:postgresql://localhost:5432/tripplanner
DATABASE_USERNAME=tripplanner
DATABASE_PASSWORD=your_password

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret

# OAuth Redirect (production only, leave blank for dev)
OAUTH_REDIRECT_URI=https://trip-calculate.online/login/oauth2/code/google

# AI Agent (Optional - for Route Planner natural language parsing)
AGENT_URL=http://localhost:8001
OPENAI_API_KEY=sk-your_openai_api_key

# Langfuse (Optional - for LLM tracing and cost tracking)
LANGFUSE_PUBLIC_KEY=pk-lf-your_public_key
LANGFUSE_SECRET_KEY=sk-lf-your_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com

# Redis (Optional - for AI response caching)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Mapbox (Optional - for 3D map visualization)
MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token
```

### Frontend Configuration
Create `frontend/.env`:

```env
# Leave empty for same-origin requests (production)
VITE_API_URL=

# For standalone frontend dev, uncomment:
# VITE_API_URL=http://localhost:8080

# Mapbox (Optional - for 3D map visualization in Route Planner)
VITE_MAPBOX_TOKEN=pk.your_mapbox_token
```

### Google Cloud Console Setup
Configure OAuth 2.0 credentials with authorized redirect URIs:
- **Development:** `http://localhost:8080/login/oauth2/code/google`
- **Production:** `https://trip-calculate.online/login/oauth2/code/google`

### Database Setup
```sql
CREATE DATABASE tripplanner;
CREATE USER tripplanner WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE tripplanner TO tripplanner;
```

**Note:** Spring Boot auto-creates tables on first run (`hibernate.ddl-auto=update`).

## Deployment

### Production Build

```bash
# Build everything
cd frontend && npm run build && cd ..
rm -rf src/main/resources/static/*
cp -r frontend/dist/* src/main/resources/static/
mvn clean package -DskipTests

# Build Docker image
docker build -t trip-calculate .

# Run container
docker run -d -p 8080:8080 \
  -e DATABASE_URL=... \
  -e DATABASE_USERNAME=... \
  -e DATABASE_PASSWORD=... \
  -e GOOGLE_CLIENT_ID=... \
  -e GOOGLE_CLIENT_SECRET=... \
  --name trip-calculate-container \
  trip-calculate
```

### CI/CD

Pushing to `master` branch triggers automatic deployment via GitHub Actions:
1. Builds React frontend
2. Builds Spring Boot backend with embedded frontend
3. Builds Python agent Docker image
4. Deploys both containers to production server

## Project Structure

```
tripcalculate/
├── frontend/                      # React 19 + TypeScript SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/              # Login, logout, user profile
│   │   │   ├── calculator/        # Trip expense calculator
│   │   │   ├── car/               # CarPicker (catalog search / presets / AI estimate)
│   │   │   ├── dashboard/         # Profile, stats, routes, CarsCard (My Cars garage)
│   │   │   ├── common/            # Header, footer, modal
│   │   │   ├── ui/                # Tailwind UI components
│   │   │   ├── MapContainer.tsx   # Leaflet map wrapper
│   │   │   ├── RoutePlanner.tsx   # Main route planner
│   │   │   ├── RoutePanel.tsx     # Waypoint management, settings, date picker
│   │   │   ├── StatsPanel.tsx     # Route statistics
│   │   │   ├── AgentActivitySlot.tsx # Latest-result concierge slot (progress → result card)
│   │   │   ├── AgentProgress.tsx  # Live per-agent SSE progress steps
│   │   │   ├── TripResultCard.tsx # AI trip result: stops, cost, fuel, Waze links
│   │   │   └── WeatherStrip.tsx   # Shared weather + risk-flag strip (card + panel)
│   │   ├── contexts/              # Auth, Theme, Language providers
│   │   ├── i18n/                  # Translation files
│   │   ├── pages/                 # HomePage, RoutePlannerPage
│   │   ├── services/              # API clients (axios), agentStreamService (SSE), weatherService
│   │   ├── styles/                # Global CSS, Tailwind config
│   │   └── types/                 # TypeScript interfaces
│   ├── public/                    # Static assets (images)
│   └── package.json
│
├── agent/                         # Python FastAPI + LangGraph AI service
│   ├── app/
│   │   ├── main.py                # FastAPI app (sync + SSE endpoints), Langfuse tracing wrapper
│   │   ├── graph.py               # LangGraph StateGraph: supervise → parse/geocode → fuel → weather → format
│   │   ├── nodes.py               # supervise, parse_locations, geocode_locations, retry_failed_locations, weather_enrichment, format_*
│   │   ├── streaming.py           # SSE frame generator over graph.astream (per-agent stage events)
│   │   ├── geocoding.py           # Nominatim client with retry/backoff
│   │   ├── schema.py              # Pydantic models (GraphState, ParseRouteResponse, WeatherData, FuelData)
│   │   ├── tools/
│   │   │   ├── fuel.py            # Deterministic, zero-LLM country-average fuel pricing
│   │   │   └── weather.py         # Deterministic, zero-LLM Open-Meteo corridor forecast + risk flags
│   │   └── fetchers/              # Daily fuel/FX source fetchers (EU Oil Bulletin, minfin, NBU)
│   ├── tests/                     # pytest unit + API contract tests
│   ├── Dockerfile                 # python:3.12-slim, non-root user
│   └── pyproject.toml             # Python dependencies
│
├── src/main/
│   ├── java/com/tripplanner/
│   │   ├── config/                # Security, HTTPS, CORS
│   │   ├── controller/            # REST endpoints, incl. AiStreamController (SSE relay), WeatherProxyController
│   │   ├── routing/               # Multi-provider routing proxy (Mapbox + OSRM)
│   │   ├── dto/                   # Data transfer objects
│   │   ├── entity/                # JPA entities
│   │   ├── filter/                # Rate limiting, attack mitigation
│   │   ├── repository/            # JPA repositories
│   │   └── service/               # Business logic
│   └── resources/
│       ├── static/                # Built React app (auto-generated)
│       └── application.properties
│
├── docs/                         # Documentation
│   ├── INFRASTRUCTURE.md
│   └── LOCAL-TESTING.md
│
├── .github/workflows/            # CI/CD pipeline
│   └── deploy-prod.yml
│
├── Dockerfile                    # Multi-stage Docker build (Spring Boot)
├── pom.xml                       # Maven dependencies
├── CLAUDE.md                     # AI coding assistant instructions
└── README.md
```

## Security Features

- **OAuth 2.0 Authentication** - Google login with forced re-authentication
- **CSRF Protection** - Cookie-based tokens for SPA requests
- **Rate Limiting** - Custom filter prevents API abuse
- **Attack Mitigation** - Blocks malicious requests and path traversal
- **Path Blacklisting** - Denies access to `.git`, `.env`, `/admin`, `/backup`
- **HTTPS Enforcement** - Automatic redirect with HSTS headers
- **Session Security** - 24-hour timeout, fixation protection
- **Reverse Proxy Support** - Proper header handling behind Cloudflare
- **Error Sanitization** - No stack traces in production responses

## Monitoring & Observability

### Spring Boot Actuator
- `/actuator/health` - Application health status (includes agent liveness check)
- `/actuator/prometheus` - Metrics in Prometheus format
- `/actuator/info` - Application information

**Grafana Integration:** Metrics can be scraped by Prometheus and visualized in Grafana dashboards.

### Langfuse (LLM Observability)
Every call to the AI agent creates a Langfuse trace containing:
- Full input message and parsed output
- Token usage and cost per gpt-4o-mini generation
- Geocoding results per location
- Session ID and user ID for filtering

Configure via `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, and `LANGFUSE_HOST` environment variables. When keys are absent the agent starts normally and tracing is silently skipped.

## Testing

### Backend Tests
```bash
mvn test
mvn clean verify  # Full build with tests
```

### Frontend Tests
```bash
cd frontend

# Linting
npm run lint

# Type checking (via build)
npm run build
```

### Agent Tests
```bash
cd agent
pip install -e ".[dev]"

# Unit tests (no API key needed — all LLM calls are mocked)
pytest tests/ -m "not integration" -v

# Integration tests (requires OPENAI_API_KEY)
OPENAI_API_KEY=sk-your_key pytest tests/ -m integration -v
```

### Manual Testing
```bash
# Terminal 1 - Backend
mvn spring-boot:run

# Terminal 2 - Frontend with HMR
cd frontend && npm run dev

# Open browser: http://localhost:3000
```

### Production Build Verification
```bash
# Build and verify static assets are embedded
cd frontend && npm run build && cd ..
cp -r frontend/dist/* src/main/resources/static/
mvn clean package -DskipTests

# Verify files in JAR
jar tf target/TripPlanner-v2.jar | grep "static/assets/index"

# Run JAR locally
java -jar target/TripPlanner-v2.jar
# Access at: http://localhost:8080
```

**Comprehensive Testing Guide:** See `docs/LOCAL-TESTING.md`

## API Endpoints

### Authentication
- `GET /oauth2/authorization/google` - Initiate OAuth login
- `POST /api/logout` - Logout user
- `GET /api/user/status` - Get current user info
- `GET /api/user/csrf` - Get CSRF token

### Trip Calculator
- `POST /calculate` - Calculate trip expenses (public)

### Route Planner (Authenticated)
- `GET /api/routes` - List saved routes
- `GET /api/routes/{id}` - Get route by ID
- `POST /api/routes` - Save new route
- `PUT /api/routes/{id}` - Update route
- `DELETE /api/routes/{id}` - Delete route
- `GET /api/routes/access` - Check route planner access
- `POST /api/routes/request-access` - Request access via email

### Car Garage (Authenticated)
- `GET /api/cars` - List saved cars (default first)
- `POST /api/cars` - Add a car (max 10 per user; first car becomes default)
- `PUT /api/cars/{id}` - Update a car
- `DELETE /api/cars/{id}` - Delete a car (default promotes to most recently updated)
- `PUT /api/cars/{id}/default` - Set the default car
- `POST /api/cars/estimate` - AI fuel-consumption estimate from a free-text car description (rate-limited, cached)

### AI Integration (Beta)
- `POST /api/ai/insights` - Parse a natural language route via the LangGraph agent (single request/response)
- `POST /api/ai/insights/stream` - Same agent call, streamed as Server-Sent Events with per-agent progress frames; falls back to the sync endpoint on transport failure
- `GET /api/fuel-prices` - Country-average live fuel prices for the manual (non-AI) flow
- `POST /api/weather/corridor` - Corridor weather forecast for the manual (non-AI) flow, given waypoints + a departure date
- `POST /api/routing/calculate` - Multi-provider routing with fallback (Mapbox → OSRM)

### Monitoring
- `GET /actuator/health` - Health check
- `GET /actuator/prometheus` - Prometheus metrics

## Troubleshooting

### React Build Not in JAR
```bash
# Verify static files copied
ls -la src/main/resources/static/

# Check files in JAR
jar tf target/TripPlanner-v2.jar | grep "static/assets"
```

### OAuth Redirect URI Mismatch
Ensure `OAUTH_REDIRECT_URI` environment variable exactly matches Google Cloud Console configuration (including `https://` protocol). Behind reverse proxy, verify `server.forward-headers-strategy=framework` is set.

### CSRF Token Errors
Frontend fetches CSRF token from `/api/user/csrf` on mount. Check browser console for fetch errors. Calculator endpoint (`/calculate`) is exempt from CSRF.

### Database Connection Failed
```bash
# Test PostgreSQL connection
psql -h localhost -U tripplanner -d tripplanner

# Check DATABASE_URL format
jdbc:postgresql://host:port/database
```

### Port Already in Use
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or change port in application.properties
server.port=8081
```

### Map Not Loading (Route Planner)
Ensure Leaflet CSS is imported in `frontend/src/App.tsx`:
```typescript
import 'leaflet/dist/leaflet.css';
```

## Documentation

- **Project Instructions:** `CLAUDE.md` - Guidelines for AI coding assistants
- **Local Testing Guide:** `docs/LOCAL-TESTING.md` - Comprehensive testing procedures
- **Infrastructure Setup:** `docs/INFRASTRUCTURE.md` - Deployment configuration
- **Frontend README:** `frontend/README.md` - Frontend-specific documentation

## Development Best Practices

### Code Conventions
- **Backend:** Lombok annotations (`@RequiredArgsConstructor`, `@Data`) for boilerplate reduction
- **Frontend:** Functional components with hooks, strict TypeScript mode
- **Styling:** Tailwind CSS utility classes, no CSS modules
- **State Management:** React Context API for auth, theme, and language
- **API Calls:** Centralized axios instances with base URL configuration

### Key Design Patterns
- **Single Responsibility:** Components focus on one concern
- **Provider Pattern:** Nested context providers in `App.tsx`
- **Custom Hooks:** Reusable logic via `useAuth()`, `useTheme()`, `useLanguage()`
- **DTO Pattern:** Backend separates entities from API responses
- **Repository Pattern:** JPA repositories abstract database operations

### CI/CD Pipeline
GitHub Actions workflow (`.github/workflows/deploy-prod.yml`) automatically:
1. Builds React frontend on push to `master`
2. Copies assets to Spring Boot static resources
3. Verifies build artifacts (prevents empty JAR deployment)
4. Builds Spring Boot JAR with Maven
5. Builds Docker images for both Spring Boot and the Python agent service
6. Deploys both containers to production server

**Critical Safety:** Pipeline verifies React assets are embedded before deployment.

## Contributing

This is a personal portfolio project. If you find bugs or have suggestions:
1. Open an issue describing the problem
2. Fork the repository
3. Create a feature branch (`git checkout -b feature/amazing-feature`)
4. Commit your changes following conventional commits
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## Author

**Dmytro Volskyi**
- LinkedIn: [volskyi-dmytro](https://www.linkedin.com/in/volskyi-dmytro)
- GitHub: [volskyi-dmytro](https://github.com/volskyi-dmytro)
- Live Demo: [trip-calculate.online](https://trip-calculate.online)

## License

This project is part of a portfolio application demonstrating full-stack development skills with modern web technologies.

---

**Built with ❤️ using React 19, Spring Boot 3, and PostgreSQL**
