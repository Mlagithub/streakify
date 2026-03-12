# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"坐忘" (Zuowang) is a habit tracking web application with Chinese UI. It tracks daily habits with check-ins, logs, and streak statistics.

## Development Commands

```bash
npm start              # Start the Express server on port 3847
npm run build:editor   # Bundle TipTap editor (run after modifying src/editor.js)
npm run lint           # Run ESLint on public/js/*.js and server.js
npm test               # Run Vitest tests
npm run test:watch     # Run tests in watch mode
```

## Architecture

### Backend (server.js)
- Express.js server with better-sqlite3 database
- Timezone handling is critical: `process.env.TZ` is set at startup to 'Asia/Shanghai'
- Imports shared config from `public/js/config.js` for validation constants
- Has dependency on `../scripts/db` for `getLocalDate` utility

### Frontend (public/)
- No framework - vanilla JS with string template rendering
- `index.html` - Main HTML with event delegation via `data-action` attributes
- `js/app.js` - Main application logic with reactive state (Proxy-based)
- `js/components.js` - UI rendering functions
- `js/api.js` - API client with request deduplication and cancellation support
- `js/config.js` - Shared configuration (categories, validation limits) - used by both frontend and backend
- `js/utils.js` - Utility functions
- `js/cache.js` - IndexedDB-backed caching with LRU eviction
- `js/performance.js` - Web Vitals monitoring

### TipTap Editor
- Source: `src/editor.js` - bundles TipTap with DOMPurify for XSS protection
- Built output: `public/js/tiptap-bundle.js`
- Run `npm run build:editor` after modifying src/editor.js

### Key Patterns
- Event delegation: buttons use `data-action` and `data-params` attributes; handlers registered via `initEventDelegation()`
- Reactive state: `createReactiveState()` returns a Proxy with `.subscribe()` for change notifications
- XSS protection: All user content rendered through `renderMd()` which uses DOMPurify
- Service Worker: `public/sw.js` handles offline caching and background sync

### Database Schema
SQLite tables: `habits`, `checkins`, `logs`, `habit_versions`, `migration_versions`

## Configuration

Environment variables (optional):
- `PORT` - Server port (default: 3847)
- `TIMEZONE` - Timezone (default: Asia/Shanghai)
- `ADMIN_PASSWORD` - Admin endpoints password