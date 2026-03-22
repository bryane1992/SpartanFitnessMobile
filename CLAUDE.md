# Spartan Fitness Mobile - Agent Rules

## Expo & Dependencies

- This project uses **Expo SDK 54** and must remain compatible with **Expo Go** (not dev builds).
- **NEVER** upgrade the Expo SDK version without explicit user approval.
- When adding new packages, always use `npx expo install <package>` instead of `npm install` — this ensures SDK-compatible versions.
- After adding or changing dependencies, run `npx expo-doctor` to verify compatibility.
- Do not use packages that require a custom dev build (native modules not included in Expo Go).

## Project Structure

- Source code lives in `src/`
- Screens go in `src/screens/`
- Core logic goes in `src/core/`
- Entry point is `App.js` in the root

## Tech Stack

- React Native via Expo (SDK 54)
- React Navigation (bottom tabs + stack)
- Zustand for state management
- AsyncStorage for local persistence
- expo-sqlite for structured data
- expo-location for GPS/run tracking

## Code Style

- Dark theme UI: background `#0A0A0A`, accent `#FF4136`
- Functional components with hooks only (no class components)
- Keep Expo Go compatibility as the top priority
- **NO emojis** in the UI — no emoji icons, labels, buttons, or headers. Use text or icon libraries instead.
- Make the UI stylish, bold, and visually engaging — not plain or minimal

## Project Structure (Extended)

- Data layer goes in `src/data/` (database, seeds)
- Zustand stores go in `src/store/`
- Reusable UI components go in `src/components/`

## ExerciseDB API

The app uses the **ExerciseDB API** as its exercise data source (replacing the local exercise seed).

- **Base URL**: `https://exercisedb-api.vercel.app/api/v1`
- **No auth required** — free, open API
- **1,500 exercises** with GIF demos, instructions, muscle targets

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /exercises?limit=N&offset=N` | Paginated exercise list |
| `GET /exercises/{exerciseId}` | Single exercise by ID |
| `GET /exercises?search=query` | Search by name |
| `GET /exercises?bodyPart=chest` | Filter by body part |
| `GET /exercises?muscle=biceps` | Filter by target muscle |
| `GET /exercises?equipment=barbell` | Filter by equipment |
| `GET /bodyparts` | List all body parts |
| `GET /equipments` | List all equipment types |
| `GET /muscles` | List all target muscles |

### Exercise Schema

```json
{
  "exerciseId": "VPPtusI",
  "name": "inverted row bent knees",
  "gifUrl": "https://static.exercisedb.dev/media/VPPtusI.gif",
  "targetMuscles": ["upper back"],
  "bodyParts": ["back"],
  "equipments": ["body weight"],
  "secondaryMuscles": ["biceps", "forearms"],
  "instructions": ["Step:1 ...", "Step:2 ..."]
}
```

### Integration Rules

- Cache exercises locally in SQLite after first fetch to minimize API calls
- Use `gifUrl` for exercise demos in workout view and exercise detail screens
- Map ExerciseDB body parts/muscles to our existing muscle group taxonomy
- Always handle offline gracefully — fall back to cached data
- API data layer goes in `src/data/exerciseApi.js`

## Environment

- `.env` contains `EXPO_TOKEN` for EAS builds — never commit this file
- `eas.json` is configured for iOS and Android builds
