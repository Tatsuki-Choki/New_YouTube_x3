# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a YouTube Analytics Support Tool (YouTube運用支援webアプリ) built as a single-file React application. It helps users search YouTube videos based on specific criteria and analyze engagement metrics relative to channel subscriber counts.

## Architecture

### Single-File React Application
- **File**: `you_tube運用支援webアプリ_mvp（react単一ファイル）.jsx`
- Self-contained React component with all logic, state management, and UI in one file
- Uses React hooks (useState, useEffect, useMemo) for state management
- No external build system required - designed to work with basic React setup

### Key Features
1. **Video Search**: Search YouTube videos with customizable filters (keywords, minimum views, country, time period)
2. **Engagement Analysis**: Identifies videos with views exceeding subscriber count by configurable ratios (1x, 2x, 3x)
3. **Shorts Filtering**: Can exclude, include, or show only YouTube Shorts
4. **Comment Extraction**: Fetches all comments for selected videos
5. **CSV Export**: Exports video lists and comments to CSV format

### YouTube API Integration
- Uses YouTube Data API v3
- Endpoints used:
  - `/search` - Find videos by keywords
  - `/videos` - Get video statistics and details
  - `/channels` - Get channel subscriber counts
  - `/commentThreads` - Fetch video comments
- API key stored in localStorage for persistence

### Data Processing
- **Shorts Detection**: Videos ≤60 seconds or containing #shorts tag
- **Ratio Calculation**: Compares view count to subscriber count
- **CSV Generation**: Custom implementation with proper escaping for commas and quotes

## Development Commands

Since this is a single-file React application without a build system:

```bash
# To run: Open the HTML file containing this React component in a browser
# No npm install or build process required
```

## Testing Approach

The application includes self-testing functionality that runs on startup:
- Tests CSV generation and escaping
- Validates duration parsing and Shorts detection
- Verifies ratio threshold calculations
- Results displayed in footer diagnostics section

## Important Implementation Notes

- All state management is handled via React hooks in the main App component
- CSV export functions are pure functions for testability
- Error handling includes user-friendly messages for API failures
- Supports pagination for comment fetching (100 comments per request)
- Country filtering uses YouTube API regionCode parameter