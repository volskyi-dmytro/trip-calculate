# Trip Calculate

A modern full-stack web application for trip expense calculation and route planning, built with **React 19 + TypeScript** and **Spring Boot 3**.

**Live Demo:** [trip-calculate.online](https://trip-calculate.online)

## Features

### Trip Expense Calculator
- 💰 **Fuel Cost Calculation** - Calculate and split fuel costs among passengers
- 🧮 **Smart Cost Splitting** - Automatic per-person expense breakdown
- 🔐 **Secure Authentication** - Google OAuth 2.0 with session persistence

### Route Planner
- 🗺️ **Interactive Map** - Leaflet-powered mapping with waypoint management
- 🛣️ **Road-Based Routing** - Real-time route calculation on actual roads
- 📍 **Geocoding & Reverse Geocoding** - Search locations and get addresses from coordinates
- 💾 **Save & Load Routes** - Persistent route storage with user authentication
- 🎯 **Manual Address Input** - Add waypoints by typing addresses
- ⛽ **Fuel Cost Estimation** - Calculate trip costs based on distance and fuel consumption
- 🔒 **Access Control** - Restricted feature with email-based access requests

### General Features
- 🌓 **Dark/Light Theme** - Seamless theme switching with persistence
- 🌍 **Bilingual Support** - Full English/Ukrainian localization
- 🎨 **Seasonal Backgrounds** - Dynamic header imagery
- 📱 **Fully Responsive** - Optimized for desktop, tablet, and mobile
- 🔔 **Toast Notifications** - Real-time user feedback with Sonner
- 🐳 **Docker Ready** - Containerized deployment

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **Tailwind CSS v4** - Modern utility-first styling
- **React Router v7** - Client-side routing
- **Leaflet + React Leaflet** - Interactive maps
- **Vite 7** - Lightning-fast build tool
- **Axios** - HTTP client
- **Sonner** - Toast notifications
- **Lucide React** - Icon system
- **Context API** - State management

### Backend
- **Spring Boot 3.3.2** (Java 17)
- **Spring Security + OAuth2** - Google authentication
- **Spring Data JPA** - Database abstraction
- **Spring Session JDBC** - Session persistence
- **PostgreSQL** - Primary database (MySQL/H2 supported)
- **Spring Actuator + Prometheus** - Monitoring & metrics
- **Lombok** - Code generation

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
```

### Frontend Configuration
Create `frontend/.env`:

```env
# Leave empty for same-origin requests (production)
VITE_API_URL=

# For standalone frontend dev, uncomment:
# VITE_API_URL=http://localhost:8080
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
3. Creates Docker image
4. Deploys to production server

## Project Structure

```
tripcalculate/
├── frontend/                      # React 19 + TypeScript SPA
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/             # Login, logout, user profile
│   │   │   ├── calculator/       # Trip expense calculator
│   │   │   ├── common/           # Header, footer, modal
│   │   │   ├── ui/               # Tailwind UI components
│   │   │   ├── MapContainer.tsx  # Leaflet map wrapper
│   │   │   ├── RoutePlanner.tsx  # Main route planner
│   │   │   ├── RoutePanel.tsx    # Waypoint management
│   │   │   └── StatsPanel.tsx    # Route statistics
│   │   ├── contexts/             # Auth, Theme, Language providers
│   │   ├── i18n/                 # Translation files
│   │   ├── pages/                # HomePage, RoutePlannerPage
│   │   ├── services/             # API clients (axios)
│   │   ├── styles/               # Global CSS, Tailwind config
│   │   └── types/                # TypeScript interfaces
│   ├── public/                   # Static assets (images)
│   └── package.json
│
├── src/main/
│   ├── java/com/tripplanner/
│   │   ├── config/               # Security, HTTPS, CORS
│   │   ├── controller/           # REST endpoints
│   │   ├── dto/                  # Data transfer objects
│   │   ├── entity/               # JPA entities
│   │   ├── filter/               # Rate limiting, attack mitigation
│   │   ├── repository/           # JPA repositories
│   │   └── service/              # Business logic
│   └── resources/
│       ├── static/               # Built React app (auto-generated)
│       └── application.properties
│
├── docs/                         # Documentation
│   ├── INFRASTRUCTURE.md
│   └── LOCAL-TESTING.md
│
├── .github/workflows/            # CI/CD pipeline
│   └── deploy.yml
│
├── Dockerfile                    # Multi-stage Docker build
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

Spring Boot Actuator endpoints exposed for monitoring:
- `/actuator/health` - Application health status
- `/actuator/prometheus` - Metrics in Prometheus format
- `/actuator/info` - Application information

**Grafana Integration:** Metrics can be scraped by Prometheus and visualized in Grafana dashboards.

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
GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:
1. Builds React frontend on push to `master`
2. Copies assets to Spring Boot static resources
3. Verifies build artifacts (prevents empty JAR deployment)
4. Builds Spring Boot JAR with Maven
5. Creates and pushes Docker image
6. Deploys to production server

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
