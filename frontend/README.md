# Trip Planner - React Frontend

Modern React frontend for the Trip Planner application, migrated from vanilla HTML/CSS/JavaScript to React 18 with TypeScript.

## 🚀 Features

- ✅ **Google OAuth 2.0 Authentication** - Seamless login with Google
- ✅ **Dark/Light Theme** - Toggle between themes with localStorage persistence
- ✅ **Multi-language Support** - English and Ukrainian translations
- ✅ **Trip Expense Calculator** - Calculate and split trip costs
- ✅ **Seasonal Backgrounds** - Dynamic header backgrounds based on season
- ✅ **Responsive Design** - Mobile-friendly interface
- ✅ **Type-Safe** - Full TypeScript support
- ✅ **Modern Stack** - React 18, Vite, Axios

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── common/          # Reusable UI components
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Modal.tsx
│   │   ├── auth/            # Authentication components
│   │   │   ├── LoginButton.tsx
│   │   │   ├── UserProfile.tsx
│   │   │   └── LogoutButton.tsx
│   │   └── calculator/      # Calculator components
│   │       ├── CalculatorModal.tsx
│   │       └── CalculatorForm.tsx
│   ├── contexts/            # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   └── LanguageContext.tsx
│   ├── hooks/               # Custom React hooks
│   │   └── useSeason.ts
│   ├── services/            # API services
│   │   ├── api.ts           # Axios configuration
│   │   ├── authService.ts   # Authentication API
│   │   └── calculatorService.ts
│   ├── types/               # TypeScript type definitions
│   │   ├── User.ts
│   │   ├── Trip.ts
│   │   └── index.ts
│   ├── styles/              # Global CSS
│   │   └── global.css
│   ├── pages/               # Page components
│   │   └── HomePage.tsx
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
├── public/                  # Static assets
│   └── images/              # Seasonal backgrounds
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── package.json
```

## 🛠️ Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Axios** - HTTP client
- **Context API** - State management
- **CSS Variables** - Dynamic theming

## 📦 Installation

```bash
# Install dependencies
npm install
```

## 🔧 Development

```bash
# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## 🌐 Backend Integration

### Development Mode

The Vite dev server proxies API calls to the Spring Boot backend:

- Backend URL: `http://localhost:8080`
- Frontend URL: `http://localhost:3000`

All `/api`, `/oauth2`, `/login`, `/logout`, and `/calculate` requests are automatically proxied to the backend.

### Production Mode

1. Build the React app:
   ```bash
   npm run build
   ```

2. Copy the build output to Spring Boot static resources:
   ```bash
   # From the project root
   rm -rf src/main/resources/static/*
   cp -r frontend/dist/* src/main/resources/static/
   ```

3. Spring Boot will serve the React app as static files.

## 🔐 Authentication

- Uses Google OAuth 2.0 via Spring Security
- Session-based authentication (cookies)
- CSRF token protection on all POST/PUT/DELETE requests
- Avatar images proxied through backend to avoid CORS issues

## 🎨 Theming

The app supports dark and light themes:

- Theme preference stored in localStorage
- Automatic theme application on page load
- CSS variables for dynamic theming

## 🌍 Internationalization

Currently supports:
- English (EN)
- Ukrainian (UK)

Language preference is stored in localStorage and persists across sessions.

## 🧪 API Endpoints

### Authentication
- `GET /api/user/me` - Get current user info
- `GET /api/user/status` - Check authentication status
- `GET /api/user/csrf` - Get CSRF token
- `GET /api/avatar/proxy?url={imageUrl}` - Proxy user avatar
- `POST /logout` - Logout user

### Calculator
- `POST /calculate` - Calculate trip expenses
  ```json
  {
    "customFuelConsumption": 7.5,
    "numberOfPassengers": 4,
    "distance": 250,
    "fuelCost": 1.50
  }
  ```

## 📝 Environment Variables

Create a `.env` file in the frontend directory (optional):

```env
VITE_API_URL=http://localhost:8080
```

## 🚀 Deployment

### Build Process

1. Build the React app:
   ```bash
   npm run build
   ```

2. The build output will be in the `dist/` directory.

3. Copy to Spring Boot:
   ```bash
   cp -r dist/* ../src/main/resources/static/
   ```

4. Build and deploy Spring Boot application as usual.

### CI/CD Integration

The existing GitHub Actions workflow should be updated to include:

```yaml
- name: Build React Frontend
  run: |
    cd frontend
    npm ci
    npm run build

- name: Copy Frontend Build to Spring Boot
  run: |
    rm -rf src/main/resources/static/*
    cp -r frontend/dist/* src/main/resources/static/
```

## 🐛 Troubleshooting

### CORS Issues in Development
- Make sure the Spring Boot backend is running on port 8080
- Vite proxy is configured in `vite.config.ts`

### Cookies Not Working
- Ensure `withCredentials: true` in axios config
- Backend must set appropriate CORS headers

### CSRF Token Errors
- CSRF token is automatically fetched before POST/PUT/DELETE requests
- Token is stored in memory (not localStorage)

### Build Warnings
- Image reference warnings are expected and won't affect runtime

## 📚 Next Steps

Future enhancements planned:
- Trip history page with React Router
- Real-time updates with WebSockets
- File uploads for receipts
- Maps integration for route planning
- Mobile app with React Native

## 👤 Author

Dmytro Volskyi

- LinkedIn: [volskyi-dmytro](https://www.linkedin.com/in/volskyi-dmytro)
- GitHub: [volskyi-dmytro](https://www.github.com/volskyi-dmytro)

## 📄 License

This project is part of the Trip Planner application.

---

**Migration Date:** October 2025
**Original Stack:** Vanilla HTML, CSS, JavaScript
**New Stack:** React 18 + TypeScript + Vite
