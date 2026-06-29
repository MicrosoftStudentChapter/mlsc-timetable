# Bundled backend fallback snapshot

This directory is a frozen copy of the backend's on-disk JSON mirror layout:

```
batch.json                       # GET /batch          -> list[str]
current.json                     # GET /current        -> {label}
timetable/<BATCH>.json           # GET /timetable/<B>  -> {batch, semester, classes}
```

Each file is served as a static asset by Vite (`/fallback/...`). The frontend
fetches the live backend first (when `VITE_BACKEND_URL` is set); on any
network error, non-2xx response, or unset env, it transparently falls back to
the files here so the site keeps working offline / during a backend outage.

Regenerate by copying `mlsc-timetable-backend/data/` (produced with
`JSON_MIRROR=1` or `mlsc-timetable build --mirror-json --out data/`):

```bash
cp ../mlsc-timetable-backend/data/batch.json   public/fallback/batch.json
cp ../mlsc-timetable-backend/data/current.json public/fallback/current.json
cp ../mlsc-timetable-backend/data/timetable/*.json public/fallback/timetable/
```

Payload shapes must match the live backend exactly — see
`mlsc-timetable-backend/docs/API.md`.
