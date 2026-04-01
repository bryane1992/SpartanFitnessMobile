---
name: ExerciseDB API Reference
description: ExerciseDB API details for exercise data - endpoints, schema, base URL, integration approach
type: reference
---

ExerciseDB API is the exercise data source for Spartan Fitness Mobile.

- **Base URL**: `https://exercisedb-api.vercel.app/api/v1`
- **No auth** — free, open, no API key needed
- **1,500 exercises** with GIF demos, step-by-step instructions, muscle targets
- **Key endpoints**: `/exercises`, `/exercises/{id}`, `/bodyparts`, `/equipments`, `/muscles`
- **Filters**: `?search=`, `?bodyPart=`, `?muscle=`, `?equipment=`, `?limit=&offset=`
- **Exercise fields**: exerciseId, name, gifUrl, targetMuscles[], bodyParts[], equipments[], secondaryMuscles[], instructions[]
- **GitHub**: https://github.com/ExerciseDB/exercisedb-api (README only, not self-hostable)
- Strategy: cache exercises in SQLite after first fetch, fall back to cache offline
