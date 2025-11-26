# CommonGround: AI Copilot Instructions

## Project Overview
**CommonGround** is a React + Vite web app designed to strengthen relationships through guided modules, shared conversations, and intimate connection activities. It uses Firebase for real-time data and authentication, Gemini API for AI-generated content and images, and Tailwind CSS for styling.

**Key Technologies:**
- React 18 + Hooks (Context API for state management)
- Vite (build/dev server)
- Firebase (Auth, Firestore real-time database)
- Lucide React (icon library)
- Framer Motion (animations)
- Tailwind CSS (styling)
- Gemini 2.5 Flash & Imagen 3.0 APIs (content generation)

## Architecture Patterns

### State Management
- **AppContext** (`src/AppContext.jsx`): Global UI state (tab navigation, app modes) using `useReducer`
- **App.jsx Local State**: Main monolithic component managing all data flows (messages, events, journal, profiles, etc.) via complex `useReducer`
- **Dual Storage**: Firebase Firestore for persistence + localStorage for beta session caching (prefix: `cg_beta_v1`)

### Data Model
**App state structure** (see `initialState` in App.jsx):
```javascript
{
  tab: string, // 'today' | 'chat' | 'us' | 'me'
  data: {
    messages, events, journal, shopping, wishlist, intimacy, growth, 
    art, profiles, answeredSparks, couplePortraits
  },
  inputs: { chat, journal, name, qAnswer, list, ... }
}
```

### Modules System
Three relationship-focused modules defined in `MODULES` constant:
- **Feel Closer** → Deepen connection
- **Healthy Conflict** → Resolve disagreements  
- **Clear Chats** → Fix communication

Each includes day-based stats, outcomes, and AI-generated soft watercolor anime prompts for images.

## Critical Development Workflows

### Build & Development
```bash
npm run dev      # Start Vite dev server (default: http://localhost:5173)
npm run build    # Production build to /dist
npm run preview  # Preview production build locally
./scripts/dev.sh   # Alternative dev launcher
./scripts/build.sh # Alternative build launcher
```

### Configuration Requirements
**Environment Variables/Injected Globals** (must be set before app init):
- `__app_id`: Application identifier (defaults to 'default-app-id')
- `__firebase_config`: Firebase config JSON object (required for Firebase initialization)
- `__initial_auth_token`: Optional auth token for deeplink sign-in

**Secrets** (in App.jsx):
- `GEMINI_API_KEY`: Google Generative AI key
- `TEXT_API_URL`: Gemini 2.5 Flash endpoint
- `IMAGE_API_URL`: Imagen 3.0 endpoint

## Key Patterns & Conventions

### Component Structure
- **BottomNav.jsx**: Memoized navigation with tab dispatch to AppContext
- Components use `memo()` for performance optimization
- Heavy use of conditional rendering based on `appMode` ('normal' vs 'deeply' hides nav)
- **State-driven visibility**: Components check `appMode` to control rendering

### Styling
- **Tailwind-first**: All styles use utility classes (e.g., `bg-[#1a0b2e]/95`, `text-purple-400`)
- **Dark theme**: Base colors are deep purples/blacks (`#1a0b2e`, grays, accent purples)
- **Custom colors**: Use bracket notation for specific hex values (`[#1a0b2e]`)
- **Component classes**: Reusable patterns like `backdrop-blur-lg`, `border-white/5`

### Data Flow
1. **User Input** → `inputs` object in state
2. **API Call** → Gemini or Image generation
3. **Result Storage** → Firebase + local state
4. **Dispatch Update** → Trigger re-render via `useReducer`

### Helper Functions
- `extractJSON(text)`: Parse JSON from AI responses (handles partial JSON in streaming)
- `downloadImage(base64Data, filename)`: Client-side image download
- `fileToB64(file)`: Convert file uploads to base64 for API submission
- `betaStorage.saveSession/loadSession/deleteSession`: localStorage wrapper with version prefix

### API Integration
- **Gemini Content**: POST to `generativelanguage.googleapis.com` with system prompts for relationship advice
- **Image Generation**: Uses Imagen 3.0 with soft watercolor anime art direction
- **Firebase Operations**: Real-time listeners with `onSnapshot`, server timestamps, batch operations

## Important Constraints & Known Issues

### Current Limitations
- **Monolithic App Component**: All logic in `App.jsx` (2164 lines) - consider refactoring into smaller modules
- **Circular Reference FIX**: `__initial_auth_token` initialization corrected to prevent circular deps
- **Placeholder Images**: Using `placehold.co` URLs - replace with actual assets
- **Hardcoded Prompts**: AI generation prompts are static constants in `MODULES` and `SPARKS`

### Firebase Integration
- Requires valid `firebaseConfig` injection at runtime
- Anonymous auth fallback with optional token linking
- Firestore collections: `messages`, `events`, `profiles`, `intimacy`, `growth`, `art`

## File Organization
```
src/
  App.jsx               # Main component (2164 lines, all core logic)
  AppContext.jsx        # Global UI state (tab, appMode)
  AppProvider           # Context provider wrapper
  components/
    BottomNav.jsx       # Fixed bottom navigation (memoized)
  index.css             # Tailwind imports
  main.jsx              # React entry point
```

## When Adding Features
1. **State addition**: Update `initialState` in App.jsx
2. **Tab/Route addition**: Add case to reducer, add BottomNav button
3. **AI generation**: Use Gemini text or Imagen endpoints, parse with `extractJSON`
4. **Persistence**: Save to Firestore collection + local storage via `betaStorage`
5. **UI Mode changes**: Dispatch `SET_APP_MODE` through AppContext for mode-specific rendering
