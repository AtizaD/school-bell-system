# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
- `npm start` - Start the Electron application in production mode
- `npm run dev` - Start in development mode with GPU sandbox disabled
- `npm run build` - Build distribution packages for all platforms
- `npm run build:win` - Build Windows installer (NSIS)
- `npm run build:mac` - Build macOS DMG
- `npm run build:linux` - Build Linux AppImage and DEB packages

### Development Utilities
- `npm run clean` - Clean node_modules and package-lock.json, then reinstall
- `npm run pack` - Package without distribution (for testing)
- `npm run dist` - Alias for build command

### Testing Audio
- Use the "Audio Library" tab in the app to test individual audio files
- Use the scheduler's test event functionality to test complete audio sequences
- Audio files are stored in the `audio/` directory

## Application Architecture

### Main Process (src/main/)
The application follows Electron's main/renderer process architecture:

- **main.js** - Main application entry point and orchestrator
  - Manages application lifecycle, system tray, and auto-updater
  - Implements single-instance enforcement
  - Handles window management and IPC communication
  - Integrates all core modules (DataManager, AudioPlayer, Scheduler, AuthManager)

- **scheduler.js** - Cron-based scheduling system using node-cron
  - Manages weekly bell schedules with precise timing
  - Handles event execution and audio sequence playback
  - Provides next events cache and statistics

- **audio-player.js** - Cross-platform audio playback system
  - Platform-specific audio players (Windows Media Player, macOS afplay, Linux paplay)
  - Handles audio sequences with repeat functionality
  - Volume control and audio validation

- **auth-manager.js** - Security and authentication system
  - AES-256-GCM encryption with machine binding
  - bcryptjs password hashing
  - Session management with auto-logout
  - Migration support for encryption format updates

- **data-manager.js** - Data persistence and management
  - JSON-based data storage with automatic backups
  - Manages schedules, audio files, templates, settings, and logs
  - Data validation and error recovery

### Renderer Process (src/renderer/)
- **index.html** - Main application UI with tabbed interface
- **js/app.js** - Main renderer application logic and IPC communication
- **js/schedule.js** - Weekly schedule management UI
- **js/audio.js** - Audio library management and playback controls
- **js/settings.js** - Application settings and configuration
- **js/templates.js** - Schedule template creation and management

### Key Features Implementation
- **Authentication**: Machine-bound encrypted storage with bcryptjs hashing
- **Scheduling**: node-cron with timezone support and event validation
- **Audio Management**: Cross-platform audio playback with sequence support
- **System Integration**: Auto-launch, system tray, and background operation
- **Auto-Updates**: GitHub releases integration with electron-updater
- **Data Management**: Export/import functionality with JSON storage

### Dependencies
- **Electron 37.1.0** - Desktop application framework
- **node-cron** - Cron-based scheduling
- **bcryptjs** - Password hashing (production-safe alternative to bcrypt)
- **auto-launch** - System startup integration
- **electron-updater** - Auto-update functionality
- **node-machine-id** - Machine fingerprinting for security

### Development Notes
- Use development mode (`npm run dev`) for faster iteration with dev tools
- Audio files are managed in the `audio/` directory with metadata in JSON storage
- Authentication data is encrypted and machine-bound for security
- The application runs in system tray and supports background operation
- All IPC communication is handled through the main process with proper validation

### Security Considerations
- Authentication data uses AES-256-GCM encryption
- Machine binding prevents auth data transfer between computers
- Session management with automatic timeout
- Content Security Policy implemented for renderer process
- No plaintext password storage