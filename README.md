# Maimai DX Explorer

A mobile catalog and random song roulette application for **maimai DX**, built with **React Native (Expo)** on the frontend and a custom **Express.js** backend API that fetches and normalizes song and chart data from CloudFront (`https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json`).

---

## Features

### Backend API (`maimai-api`)
- **CloudFront Data Ingestion & Caching**: Fetches maimai song and sheet data from CloudFront and caches it in memory for **15 minutes** to reduce repeated upstream requests.
- **Manual Cache Refresh**: Supports forcing a fresh pull from CloudFront via `POST /api/refresh`.
- **Difficulty Normalization**: Normalizes chart difficulty labels consistently (such as mapping `remaster` variants to `Re:MASTER`, alongside `BASIC`, `ADVANCED`, `EXPERT`, and `MASTER`).
- **REST Endpoints**:
  - `GET /api/health` — Service status, data source info, and total cached songs.
  - `GET /api/songs` — Filterable song list by search query (`q`), difficulty (`difficulty`), and version (`version`).
  - `GET /api/songs/:id` — Single song details by ID.
  - `POST /api/refresh` — Forces a cache refresh from CloudFront.

### Mobile App (React Native + Expo)
- **Custom Splash Screen**: Branded startup screen before entering the main app.
- **Song Randomizer (Home)**:
  - Filter the randomizer pool using dropdown selectors for **Category**, **Version**, and **Min Level / Max Level** range.
  - Displays the live eligible pool count and lets you tap the picked song to open its chart details.
- **Song Catalog List with Pagination & Sorting**:
  - Search songs by title, artist, category, or version.
  - Filter by **Category**, **Version**, **Difficulty** (including `Re:MASTER`), and **Level** via dropdown modals.
  - Sort results by **Default**, **Level (Ascending / Descending)**, or **BPM (Ascending / Descending)**.
  - Paginated list (`Sebelumnya` / `Berikutnya`) with navigation to **Song Detail**.
- **Song Detail & Profile / About Screens**: Inspect full chart levels/metadata per song and view app/developer information.

---

## Repository Structure

```text
.
├── maimai-api/                  # Custom Express.js API server
│   ├── server.js
│   └── package.json
└── maimai-explorer-app/         # React Native (Expo) mobile application
    ├── app.json
    ├── package.json
    └── src/
        ├── screens/
        │   ├── HomeScreen.js
        │   ├── SongsListScreen.js
        │   ├── SongDetailScreen.js
        │   └── ProfileScreen.js
        └── services/
            └── apiService.js