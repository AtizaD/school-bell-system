# School Bell System v1.0.2 - Multi-Platform Release

🔔 **Automated school bell scheduling system with audio playback and authentication**

## ✨ Key Features

### 📅 **Smart Scheduling**
- Weekly bell schedules with precise timing
- Multiple events per day with custom names
- Enable/disable individual events
- Template system for reusing schedule patterns

### 🎵 **Audio Management** 
- Upload and manage audio files (MP3, WAV, M4A, OGG, AAC)
- **🔒 Persistent audio storage** - Files survive app updates
- Audio sequence builder with configurable repeat intervals
- Volume control and audio testing
- Support for multiple audio files per event
- Automatic migration from installation directory

### 🔐 **Security & Authentication**
- Secure admin authentication with encrypted storage
- Session management with auto-logout
- Machine-bound authentication data
- Password change functionality

### 🔄 **Auto-Update System**
- Automatic update checking every 4 hours
- User-friendly update dialogs with progress
- Delta updates for faster downloads
- Manual update checking via Help menu

### 📊 **Management & Monitoring**
- Activity logging with detailed history
- System status monitoring
- Data export/import functionality
- Settings management interface

## 🚀 **Installation**

### **System Requirements**
- Windows 10/11 (64-bit)
- Audio output device (speakers/headphones)
- 100MB free disk space

### **Quick Start**
1. Download the installer for your platform (Windows/macOS/Linux)
2. Run the installer and follow the setup wizard
3. Launch the application
4. Create your admin account (first time only)
5. Upload audio files and create schedules

> **📢 Note**: Audio files are now stored in persistent storage and will survive app updates!

## 📝 **First Time Setup Guide**

### **Step 1: Admin Account**
- Create a secure username (3-20 characters)
- Set a strong password (minimum 6 characters with numbers)
- Your credentials are encrypted and machine-bound

### **Step 2: Audio Files**
- Click "Audio Library" → "Upload Audio"
- Drag and drop or browse for audio files
- Supported formats: MP3, WAV, M4A, OGG, AAC
- Test audio files before using in schedules
- Configure repeat interval between audio files in Settings (0-30 seconds)

### **Step 3: Create Schedules**
- Go to "Weekly Schedule"
- Select a day and click "Add Event"
- Set time, name, and audio sequence
- Enable the event to activate scheduling

### **Step 4: Templates (Optional)**
- Create templates from existing schedules
- Apply templates to multiple days
- Save common patterns for reuse

## 🔧 **Technical Details**

### **Built With**
- **Electron 37.1.0** - Cross-platform desktop framework
- **Node.js** - JavaScript runtime
- **bcryptjs** - Password encryption
- **node-cron** - Schedule management
- **electron-updater** - Auto-update system

### **Security Features**
- AES-256-GCM encryption for authentication data
- Machine fingerprinting for data binding
- Secure session management
- No plaintext password storage

### **Audio System**
- Native OS audio integration + HTML5 Audio API
- Platform-specific audio players (Windows Media Player, macOS afplay, Linux paplay)
- **Persistent storage in userData directory** - survives app updates
- Volume control and audio testing
- **Configurable repeat intervals** between audio files (0-30 seconds)
- Multiple format support with automatic detection
- **Automatic migration** from old storage locations

## 📊 **What's New**

### **v1.0.2 - Multi-Platform Release**
- 🌍 **Full cross-platform support** - Windows, macOS, and Linux builds
- 🍎 **Universal macOS** - Works on Intel and Apple Silicon Macs
- 🐧 **Linux options** - AppImage (portable) and DEB packages
- 🔄 **Unified auto-updater** - Works across all platforms
- 📦 **Professional installers** - Platform-native installation experience

### **v1.0.1 - Audio Persistence Update**
- 🔒 **Fixed audio file persistence** - Files now survive app updates
- 🔄 **Automatic migration** from installation directory to persistent storage
- ⚙️ **Configurable repeat intervals** between audio files (0-30 seconds)
- 🔧 **Improved password change UI** with proper modal dialogs
- 📢 **User notifications** when audio files are migrated
- 🛠️ **Enhanced error handling** and user feedback

### **v1.0.0 - Initial Release**
- ✨ Initial release with full feature set
- 🔐 Complete authentication system
- 🎵 Audio management and playback
- 📅 Weekly scheduling with templates
- 🔄 Auto-update functionality
- 📝 Activity logging and monitoring

## 🐛 **Known Issues**
- Manual installations previously cleared audio files ✅ **FIXED in v1.0.1**

## 💡 **Support & Feedback**
- Report issues: [GitHub Issues](https://github.com/AtizaD/school-bell-system/issues)
- Feature requests: [GitHub Discussions](https://github.com/AtizaD/school-bell-system/discussions)
- Documentation: [README](https://github.com/AtizaD/school-bell-system#readme)

## 📜 **License**
MIT License - See [LICENSE](https://github.com/AtizaD/school-bell-system/blob/main/LICENSE) for details

---

**Download the installer below and start automating your school bell system today!** 🔔

*Built with ❤️ by AtizaD using modern web technologies*
