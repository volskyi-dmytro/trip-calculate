# Trip Calculate

A modern web application for calculating and splitting trip expenses, built with **React 18 + TypeScript** and **Spring Boot**.

## Features

- 🔐 **Google OAuth 2.0 Authentication** - Secure login with session persistence
- 💰 **Trip Expense Calculator** - Calculate and split fuel costs among passengers
- 🌓 **Dark/Light Theme** - Toggle with localStorage persistence
- 🌍 **Multi-language Support** - English and Ukrainian with i18n
- 🎨 **Seasonal Backgrounds** - Dynamic header images based on season
- 📱 **Responsive Design** - Mobile-friendly interface
- 🐳 **Dockerized** - Easy deployment with Docker

## Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite (build tool)
- Axios (HTTP client)
- Context API (state management)

**Backend:**
- Spring Boot 3
- Spring Security with OAuth2
- PostgreSQL 15
- Spring Session JDBC

## Prerequisites

- Java 17
- Maven 3.6+
- Node.js 20+
- PostgreSQL 15
- Docker (for production deployment)

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

Create `.env` file in project root:

```env
DATABASE_URL=jdbc:postgresql://localhost:5432/tripplanner
DATABASE_USERNAME=tripplanner
DATABASE_PASSWORD=your_password
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OAUTH_REDIRECT_URI=http://localhost:8080/login/oauth2/code/google
```

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
trip-calculate/
├── frontend/              # React + TypeScript frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # Context providers
│   │   ├── services/     # API services
│   │   └── types/        # TypeScript types
│   └── public/           # Static assets
├── src/main/
│   ├── java/             # Spring Boot backend
│   └── resources/
│       └── static/       # Built React app (generated)
└── Dockerfile            # Production Docker image
```

## Testing

See detailed testing guide: `docs/LOCAL-TESTING.md`

**Quick Test:**
```bash
# Test backend
mvn test

# Test frontend build
cd frontend && npm run build

# Manual testing
# 1. Start backend: mvn spring-boot:run
# 2. Start frontend: cd frontend && npm run dev
# 3. Open: http://localhost:3000
```

## Documentation

- **Frontend README:** `frontend/README.md`
- **Local Testing Guide:** `docs/LOCAL-TESTING.md`
- **Infrastructure Setup:** `docs/INFRASTRUCTURE.md`

## Live Demo

🌐 **https://trip-calculate.online**

## Author

**Dmytro Volskyi**
- LinkedIn: [volskyi-dmytro](https://www.linkedin.com/in/volskyi-dmytro)
- GitHub: [volskyi-dmytro](https://github.com/volskyi-dmytro)

## License

This project is part of a portfolio application.
