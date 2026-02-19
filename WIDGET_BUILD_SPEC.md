# Feedback Widget — Build Spec

## What this is

A distributable feedback widget that developers embed in their apps. It collects user feedback (title, description, email) and sends it to a backend Feedback Service API. The widget ships as:

1. **React component** — importable via `npm install`
2. **Standalone embed script** — a single `<script>` tag any website can drop in (no React required)

## Backend API (already deployed, do NOT build this)

The widget talks to one endpoint:

```
POST {API_BASE_URL}/api/feedback/submit
```

### Request

```
Headers:
  Content-Type: application/json
  X-API-Key: <project-api-key>

Body:
{
  "projectId": "string (required)",
  "title": "string (required)",
  "description": "string (required)",
  "email": "string (optional)",
  "metadata": {
    "userAgent": "string (optional)",
    "url": "string (optional)",
    "referrer": "string (optional)",
    "customFields": "Record<string, any> (optional)"
  }
}
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "feedbackId": "uuid",
    "type": "technical | non-technical",
    "category": "bug | feature | improvement | general"
  }
}
```

### Error responses

- `401` — Missing `X-API-Key` header
- `400` — Missing required fields (`projectId`, `title`, `description`)
- `403` — Invalid API key or project mismatch
- `500` — Server error

### CORS

The API returns these headers so cross-origin requests from any domain work:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type, X-API-Key, Authorization
Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS
```

---

## Deliverable 1: React Component

### Package name

`@feedback/react-widget` (or whatever scope you choose)

### Props

```typescript
interface FeedbackWidgetProps {
  // Required
  projectId: string;
  apiKey: string;

  // Optional — defaults to production URL
  apiBaseUrl?: string;

  // Optional — appearance and behavior
  config?: {
    theme?: "light" | "dark";               // default: "light"
    position?: "bottom-right" | "bottom-left" | "top-right" | "top-left"; // default: "bottom-right"
    primaryColor?: string;                   // default: "#007bff"
    title?: string;                          // default: "Send us your feedback"
    showEmail?: boolean;                     // default: true
  };

  // Optional — callbacks
  onOpen?: () => void;
  onClose?: () => void;
  onSubmit?: (data: { feedbackId: string; type: string }) => void;
  onError?: (error: string) => void;

  // Optional — pre-fill metadata
  userId?: string;
  userEmail?: string;
  customMetadata?: Record<string, unknown>;
}
```

### Usage by the developer

```tsx
import { FeedbackWidget } from '@feedback/react-widget';

function App() {
  return (
    <div>
      <MyApp />
      <FeedbackWidget
        projectId="proj_abc123"
        apiKey="fbk_secret123"
        config={{ theme: "dark", position: "bottom-right", primaryColor: "#5c5ce6" }}
        onSubmit={(data) => console.log("Submitted:", data)}
      />
    </div>
  );
}
```

### Behavior

1. Renders a floating circular button (chat bubble icon) at the configured corner position
2. Clicking the button opens a form panel with: Title (required), Description textarea (required), Email (optional)
3. On submit:
   - POST to `{apiBaseUrl}/api/feedback/submit` with `X-API-Key` header
   - Include `projectId`, `title`, `description`, `email` in body
   - Auto-collect metadata: `navigator.userAgent`, `window.location.href`, `document.referrer`
   - Merge in `customMetadata` and `userId`/`userEmail` if provided
4. On success: show a "Thanks for your feedback!" confirmation for 2 seconds, then close and reset the form
5. On error: show the error message inline below the form fields
6. Call the appropriate callback (`onSubmit` / `onError`) if provided

### Styling requirements

- **Zero external CSS dependencies** — all styles must be inline or CSS-in-JS (no Tailwind, no CSS files)
- Must not pollute the host page's styles (scoped styles, no global selectors)
- Light and dark theme support
- The widget container should use `position: fixed` with `z-index: 9999`
- Responsive: form panel should be 360px wide on desktop, full-width minus margins on mobile (< 400px viewport)
- Smooth open/close animation (fade + slide)

---

## Deliverable 2: Standalone Embed Script

A single JavaScript file that any website can include without React:

```html
<script src="https://your-cdn.com/feedback-widget.js"></script>
<script>
  FeedbackWidget.init({
    projectId: 'proj_abc123',
    apiKey: 'fbk_secret123',
    theme: 'light',
    position: 'bottom-right',
    primaryColor: '#007bff',
    title: 'Help us improve!',
    onSubmit: function(data) { console.log('Submitted:', data); }
  });
</script>
```

### How to build this

- Use Vite (or Rollup) with a separate entry point that:
  1. Bundles React + ReactDOM internally (the host page does NOT need React)
  2. Renders the same FeedbackWidget component into a shadow DOM container (to isolate styles)
  3. Exposes a global `window.FeedbackWidget` object with:
     - `init(config)` — mount the widget
     - `open()` — programmatically open the form
     - `close()` — programmatically close it
     - `destroy()` — unmount and clean up
- Output format: IIFE, single file, minified
- Target filename: `feedback-widget.js` (and `feedback-widget.min.js`)

### `FeedbackWidget.init(config)` accepts

```typescript
{
  projectId: string;        // required
  apiKey: string;           // required
  apiBaseUrl?: string;      // default: production URL
  theme?: 'light' | 'dark';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  title?: string;
  showEmail?: boolean;
  userId?: string;
  email?: string;
  customMetadata?: Record<string, any>;
  onOpen?: () => void;
  onSubmit?: (data: { feedbackId: string; type: string }) => void;
  onError?: (error: string) => void;
}
```

---

## Project structure

```
feedback-widget/
├── src/
│   ├── FeedbackWidget.tsx      # Main React component (shared by both deliverables)
│   ├── index.ts                # React package entry: export { FeedbackWidget }
│   ├── embed.tsx               # Standalone entry: mounts widget, exposes global API
│   └── types.ts                # Shared TypeScript types
├── package.json
├── tsconfig.json
├── vite.config.ts              # Two build targets: library (React) + IIFE (embed)
├── README.md                   # Developer-facing docs with usage examples
└── demo/
    ├── react-demo.tsx          # Test page for React component
    └── embed-demo.html         # Test page for script tag embed
```

### package.json key fields

```json
{
  "name": "@feedback/react-widget",
  "version": "0.1.0",
  "main": "dist/index.cjs",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "react": ">=17",
    "react-dom": ">=17"
  },
  "files": ["dist"],
  "scripts": {
    "build": "vite build",
    "build:embed": "vite build --config vite.embed.config.ts",
    "dev": "vite",
    "typecheck": "tsc --noEmit"
  }
}
```

### vite.config.ts — React library build

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [react(), dts({ rollupTypes: true })],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
```

### vite.embed.config.ts — Standalone IIFE build

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist/embed',
    lib: {
      entry: 'src/embed.tsx',
      name: 'FeedbackWidget',
      formats: ['iife'],
      fileName: () => 'feedback-widget.js',
    },
  },
});
```

---

## Reference implementation

The backend project has a working reference widget at `src/feedback/widget.tsx`. Use it as a starting point for the React component. Key things to keep from it:

- The `apiBaseUrl` prop pattern (defaults to empty string for same-origin, set to full URL for cross-origin)
- The `X-API-Key` header on submit
- The metadata auto-collection (`userAgent`, `url`, `referrer`)
- The inline styles pattern (no external CSS)
- The light/dark theme color logic

Key things to **improve** over the reference:

- Add open/close animation (the reference has none)
- Add shadow DOM isolation in the embed script version
- Add `onSubmit`, `onClose`, `onOpen`, `onError` callbacks
- Add mobile responsive breakpoint
- Add the programmatic API (`open()`, `close()`, `destroy()`)
- Add `showEmail` config option
- Add `userId`, `userEmail`, `customMetadata` prop merging into the metadata payload

---

## Testing checklist

- [ ] React component renders floating button
- [ ] Clicking button opens form panel
- [ ] Closing panel resets form state
- [ ] Submit with valid data returns success, shows confirmation
- [ ] Submit with missing fields shows validation error
- [ ] Submit with invalid API key shows 403 error
- [ ] Light and dark themes render correctly
- [ ] All 4 position options work
- [ ] Custom `primaryColor` applies to button and submit
- [ ] `onSubmit` callback fires with `{ feedbackId, type }`
- [ ] `onError` callback fires on failure
- [ ] Embed script `FeedbackWidget.init()` works on a plain HTML page
- [ ] Embed script `open()`, `close()`, `destroy()` work
- [ ] Embed script does not leak styles to host page
- [ ] Works cross-origin (widget on localhost:3000, API on different domain)
- [ ] Mobile viewport (< 400px) renders correctly
