const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage, Notification } = require('electron');

// Optional auto-updater - gracefully handle if not available
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  console.log('Auto-updater loaded successfully');
} catch (error) {
  console.warn('Auto-updater not available:', error.message);
  autoUpdater = {
    checkForUpdatesAndNotify: () => Promise.resolve(),
    on: () => {},
    setFeedURL: () => {},
    checkForUpdates: () => Promise.resolve()
  };
}
const path = require('path');
const fs = require('fs').promises;
const DataManager = require('./data-manager');
const AudioPlayer = require('./audio-player');
const Scheduler = require('./scheduler');
const AuthManager = require('./auth-manager');

// Disable hardware acceleration for better compatibility
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--no-sandbox');

/**
 * School Bell System - Production Main Process
 * 
 * Features:
 * - Single instance enforcement
 * - System tray with background operation
 * - Auto-startup with Windows
 * - Auto-updater with GitHub releases
 * - Secure authentication system
 * - Audio scheduling and playback
 * - Cross-platform compatibility
 */
class SchoolBellApp {
  constructor() {
    // Core window and tray
    this.mainWindow = null;
    this.tray = null;
    
    // Application modules
    this.dataManager = null;
    this.audioPlayer = null;
    this.scheduler = null;
    this.authManager = null;
    this.autoLauncher = null;
    
    // Application state
    this.isDevelopment = process.argv.includes('--dev');
    this.isInitialized = false;
    this.isQuitting = false;
    this.hasShownTrayNotification = false;
    
    // Auto-updater state
    this.updateCheckInterval = null;
    this.updateAvailable = false;
    
    // Error handling
    process.on('uncaughtException', this.handleUncaughtException.bind(this));
    process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
  }

  /**
   * Initialize the application
   */
  async initialize() {
    try {
      console.log('🔔 Initializing School Bell System...');
      
      if (this.isInitialized) {
        console.log('Already initialized, skipping...');
        return;
      }

      // Enforce single instance
      if (!this.setupSingleInstance()) {
        return; // Another instance is running
      }

      // Initialize core modules
      await this.initializeModules();
      
      // Setup application
      this.setupApp();
      this.setupIPC();
      this.configureAutoUpdater();
      
      this.isInitialized = true;
      console.log('✅ School Bell System initialized successfully');
      
      // Start update checking after initialization
      this.scheduleUpdateCheck();
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.showFatalError('Initialization Error', error.message);
      app.quit();
    }
  }

  /**
   * Setup single instance lock
   */
  setupSingleInstance() {
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      console.log('Another instance is already running. Exiting...');
      app.quit();
      return false;
    }

    // Handle second instance attempt
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      console.log('Second instance detected, showing main window');
      this.showMainWindow();
      
      // Show notification about already running
      this.showTrayNotification(
        'School Bell System', 
        'Application is already running in the system tray'
      );
    });

    return true;
  }

  /**
   * Initialize application modules
   */
  async initializeModules() {
    console.log('Initializing application modules...');

    // Authentication Manager
    this.authManager = new AuthManager();
    this.authManager.onSessionExpired = () => this.handleSessionExpired();

    // Data Manager
    this.dataManager = new DataManager();
    const initResult = await this.dataManager.initialize();
    
    // Show migration notification if files were migrated
    if (initResult.migrationResult && initResult.migrationResult.migrated && initResult.migrationResult.fileCount > 0) {
      console.log(`🎵 Audio migration completed: ${initResult.migrationResult.fileCount} files moved to persistent storage`);
      
      // Show notification after tray is set up
      setTimeout(() => {
        this.showMigrationNotification(initResult.migrationResult.fileCount);
      }, 2000);
    }

    // Audio Player
    this.audioPlayer = new AudioPlayer(this.dataManager);
    await this.audioPlayer.init();

    // Scheduler
    this.scheduler = new Scheduler(this.dataManager, this.audioPlayer);
    await this.scheduler.init();

    console.log('✅ All modules initialized');
  }

  /**
   * Setup main application
   */
  setupApp() {
    app.whenReady().then(async () => {
      console.log('App ready, setting up UI...');
      
      // Create system tray first (for background operation)
      this.createSystemTray();
      
      // Create main window
      this.createMainWindow();
      
      // Setup application menu
      this.createAppMenu();
      
      // Setup auto-launch
      await this.setupAutoLaunch();
      
      console.log('✅ UI setup complete');
    });

    // Handle window events
    app.on('window-all-closed', () => {
      // Don't quit - keep running in system tray
      console.log('All windows closed, continuing in background...');
    });

    app.on('activate', () => {
      // macOS: Re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    // Handle application quit
    app.on('before-quit', async (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.showQuitConfirmation();
        return;
      }
      
      console.log('Application quitting, cleaning up...');
      await this.cleanup();
    });

    app.on('will-quit', () => {
      console.log('Application will quit');
      this.cleanup();
    });
  }

  /**
   * Create system tray
   */
  createSystemTray() {
    try {
      // Prevent duplicate tray creation
      if (this.tray) {
        console.log('System tray already exists');
        return;
      }

      console.log('Creating system tray...');

      // Load tray icon
      const trayIcon = this.loadTrayIcon();
      this.tray = new Tray(trayIcon);
      
      // Configure tray
      this.tray.setToolTip('School Bell System - Click to open');
      this.updateTrayMenu();
      
      // Handle tray events
      this.tray.on('double-click', () => {
        this.toggleMainWindow();
      });

      this.tray.on('click', () => {
        if (process.platform === 'win32') {
          this.toggleMainWindow();
        }
      });
      
      console.log('✅ System tray created');
      
    } catch (error) {
      console.warn('⚠️ Failed to create system tray:', error.message);
      // App can still function without tray
    }
  }

  /**
   * Load tray icon
   */
  loadTrayIcon() {
    const trayIconPath = this.isDevelopment 
      ? path.join(__dirname, '../../build/tray-icon.png')
      : path.join(process.resourcesPath, 'tray-icon.png');
    
    try {
      const trayIcon = nativeImage.createFromPath(trayIconPath);
      if (!trayIcon.isEmpty()) {
        return trayIcon;
      }
    } catch (error) {
      console.warn('Custom tray icon not found, using fallback');
    }
    
    // Fallback: Create simple icon programmatically
    return this.createFallbackTrayIcon();
  }

  /**
   * Create fallback tray icon
   */
  createFallbackTrayIcon() {
    // Simple 16x16 PNG icon data (bell shape)
    const iconData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0xF3, 0xFF,
      0x61, 0x00, 0x00, 0x00, 0x4A, 0x49, 0x44, 0x41, 0x54, 0x38, 0x8D, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
      0x03, 0x3A, 0x00, 0xE4, 0xFF, 0xFF, 0xFF, 0x87, 0x01, 0x08, 0x18, 0x19, 0x19, 0xF9, 0x87, 0x81,
      0x81, 0x81, 0x09, 0x03, 0x03, 0x03, 0x7F, 0x86, 0x86, 0x86, 0x06, 0x06, 0x06, 0x06, 0x86, 0x87,
      0x87, 0x87, 0x97, 0x91, 0x91, 0x91, 0x1F, 0x1C, 0x1C, 0x1C, 0xFC, 0x1D, 0x1D, 0x1D, 0x1D, 0x00,
      0x44, 0x32, 0x32, 0x32, 0x72, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60,
      0x82
    ]);
    
    return nativeImage.createFromBuffer(iconData);
  }

  /**
   * Update tray context menu
   */
  updateTrayMenu() {
    if (!this.tray) return;
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🔔 School Bell System',
        type: 'normal',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '📖 Show Window',
        click: () => this.showMainWindow()
      },
      {
        label: '🙈 Hide Window', 
        click: () => this.hideMainWindow(),
        enabled: this.mainWindow && this.mainWindow.isVisible()
      },
      { type: 'separator' },
      {
        label: '⏰ Next Events',
        submenu: this.createNextEventsSubmenu()
      },
      { type: 'separator' },
      {
        label: '🎵 Stop All Audio',
        click: async () => {
          try {
            await this.audioPlayer.stop();
            this.showTrayNotification('Audio Stopped', 'All audio playback stopped');
          } catch (error) {
            console.error('Failed to stop audio:', error);
          }
        }
      },
      {
        label: '🔄 Reload Schedules',
        click: async () => {
          try {
            await this.scheduler.reloadSchedules();
            this.showTrayNotification('Schedules Reloaded', 'All schedules have been reloaded');
          } catch (error) {
            console.error('Failed to reload schedules:', error);
          }
        }
      },
      { type: 'separator' },
      {
        label: '⚙️ Settings',
        submenu: [
          {
            label: 'Start with Windows',
            type: 'checkbox',
            checked: this.getAutoLaunchStatus(),
            click: (menuItem) => this.toggleAutoLaunch(menuItem.checked)
          },
          {
            label: 'Run in Background',
            type: 'checkbox',
            checked: true,
            enabled: false
          }
        ]
      },
      { type: 'separator' },
      {
        label: '❌ Quit School Bell System',
        click: () => this.confirmQuit()
      }
    ]);
    
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * Create next events submenu
   */
  createNextEventsSubmenu() {
    try {
      if (!this.scheduler) {
        return [{ label: 'Scheduler not ready', enabled: false }];
      }
      
      const nextEvents = this.scheduler.getNextEvents(3);
      
      if (nextEvents.length === 0) {
        return [{ label: 'No upcoming events', enabled: false }];
      }
      
      return nextEvents.map(event => ({
        label: `${event.name} - ${event.time} (${this.formatTimeUntil(event.timeUntil)})`,
        enabled: false
      }));
      
    } catch (error) {
      return [{ label: 'Error loading events', enabled: false }];
    }
  }

  /**
   * Format time until next event
   */
  formatTimeUntil(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  /**
   * Show tray notifications
   */
  showTrayNotification(title, body) {
    try {
      if (process.platform === 'win32' && this.tray) {
        // Windows: Use tray balloon
        this.tray.displayBalloon({
          title: title,
          content: body
        });
      } else if (Notification.isSupported()) {
        // Other platforms: Use system notifications
        const notification = new Notification({
          title: title,
          body: body
        });
        notification.show();
      }
    } catch (error) {
      console.warn('Failed to show notification:', error.message);
    }
  }

  /**
   * Show migration notification to user
   */
  showMigrationNotification(fileCount) {
    try {
      const title = '🎵 Audio Files Migrated';
      const body = `${fileCount} audio files have been moved to persistent storage. They will now survive app updates!`;
      
      this.showTrayNotification(title, body);
      console.log(`Migration notification shown: ${fileCount} files migrated`);
      
    } catch (error) {
      console.warn('Failed to show migration notification:', error.message);
    }
  }

  /**
   * Window management
   */
  createMainWindow() {
    if (this.mainWindow) {
      this.showMainWindow();
      return;
    }

    console.log('Creating main window...');

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      icon: this.getAppIcon(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: path.join(__dirname, 'preload.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false
      },
      show: false,
      autoHideMenuBar: false
    });

    // Load application
    this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      
      // Set window title with version
      const currentVersion = app.getVersion();
      this.mainWindow.setTitle(`School Bell System v${currentVersion}`);
      
      console.log('✅ Main window ready');
    });

    // Handle window close - minimize to tray instead of quitting
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.hideMainWindow();
        
        // Show tray notification on first minimize
        if (!this.hasShownTrayNotification) {
          this.showTrayNotification(
            'School Bell System', 
            'App minimized to system tray. Double-click the tray icon to restore.'
          );
          this.hasShownTrayNotification = true;
        }
      }
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  /**
   * Get application icon
   */
  getAppIcon() {
    const iconPath = this.isDevelopment
      ? path.join(__dirname, '../../build/icon.png')
      : path.join(__dirname, '../renderer/assets/icons/icon.png');
    
    try {
      return nativeImage.createFromPath(iconPath);
    } catch (error) {
      console.warn('App icon not found, using default');
      return undefined;
    }
  }

  /**
   * Window visibility controls
   */
  showMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
      this.updateTrayMenu();
    } else {
      this.createMainWindow();
    }
  }

  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
      this.updateTrayMenu();
    }
  }

  toggleMainWindow() {
    if (this.mainWindow && this.mainWindow.isVisible()) {
      this.hideMainWindow();
    } else {
      this.showMainWindow();
    }
  }

  /**
   * Auto-launch setup
   */
  async setupAutoLaunch() {
    try {
      const AutoLaunch = require('auto-launch');
      
      this.autoLauncher = new AutoLaunch({
        name: 'School Bell System',
        path: app.getPath('exe'),
        isHidden: false
      });
      
      // Enable auto-launch by default for school bell system
      const settings = this.dataManager?.getSettings();
      const isEnabled = await this.autoLauncher.isEnabled();
      
      if (settings?.autoStart !== false && !isEnabled) {
        await this.enableAutoLaunch();
      }
      
      console.log('✅ Auto-launch configured');
      
    } catch (error) {
      console.warn('⚠️ Auto-launch setup failed:', error.message);
    }
  }

  async enableAutoLaunch() {
    try {
      if (this.autoLauncher) {
        await this.autoLauncher.enable();
        console.log('Auto-launch enabled');
        this.showTrayNotification('Auto-Start Enabled', 'School Bell System will start with Windows');
      }
    } catch (error) {
      console.error('Failed to enable auto-launch:', error);
    }
  }

  async disableAutoLaunch() {
    try {
      if (this.autoLauncher) {
        await this.autoLauncher.disable();
        console.log('Auto-launch disabled');
        this.showTrayNotification('Auto-Start Disabled', 'School Bell System will not start with Windows');
      }
    } catch (error) {
      console.error('Failed to disable auto-launch:', error);
    }
  }

  getAutoLaunchStatus() {
    try {
      return this.autoLauncher ? this.autoLauncher.isEnabled() : false;
    } catch (error) {
      return false;
    }
  }

  async toggleAutoLaunch(enable) {
    if (enable) {
      await this.enableAutoLaunch();
    } else {
      await this.disableAutoLaunch();
    }
    
    // Update settings
    if (this.dataManager) {
      await this.dataManager.updateSettings({ autoStart: enable });
    }
    
    this.updateTrayMenu();
  }

  /**
   * Auto-updater configuration
   */
  configureAutoUpdater() {
    if (this.isDevelopment) {
      console.log('Auto-updater disabled in development mode');
      return;
    }

    console.log('Configuring auto-updater...');

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for updates...');
      this.sendUpdateStatus('checking', 'Checking for updates...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      this.updateAvailable = true;
      this.sendUpdateStatus('available', `Update ${info.version} is available`, info);
      this.showUpdateAvailableDialog(info);
    });

    autoUpdater.on('update-not-available', () => {
      console.log('No updates available');
      this.updateAvailable = false;
      this.sendUpdateStatus('not-available', 'You are using the latest version');
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.sendUpdateStatus('error', `Update error: ${err.message}`);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const { percent, bytesPerSecond, transferred, total } = progressObj;
      const message = `Downloaded ${Math.round(percent)}% (${Math.round(transferred / 1024 / 1024)}MB/${Math.round(total / 1024 / 1024)}MB)`;
      this.sendUpdateStatus('downloading', message, progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      this.sendUpdateStatus('downloaded', `Update ${info.version} ready to install`);
      this.showUpdateReadyDialog(info);
    });
  }

  scheduleUpdateCheck() {
    if (this.isDevelopment) return;
    
    // Check on startup (after 10 seconds)
    setTimeout(() => this.checkForUpdates(false), 10000);
    
    // Check every 4 hours
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates(false);
    }, 4 * 60 * 60 * 1000);
  }

  async checkForUpdates(showDialog = false) {
    if (this.isDevelopment) {
      if (showDialog) {
        this.showUpdateDialog('Development Mode', 'Update checking is disabled in development mode.');
      }
      return;
    }

    try {
      console.log('Checking for updates...');
      this.sendUpdateStatus('checking', 'Checking for updates...');
      
      const result = await autoUpdater.checkForUpdates();
      
      if (showDialog && !this.updateAvailable) {
        setTimeout(() => {
          if (!this.updateAvailable) {
            this.showUpdateDialog('No Updates', 'You are using the latest version.');
          }
        }, 3000);
      }
      
      return result;
    } catch (error) {
      console.error('Update check failed:', error);
      this.sendUpdateStatus('error', `Update check failed: ${error.message}`);
      
      if (showDialog) {
        this.showUpdateDialog('Update Check Failed', `Failed to check for updates: ${error.message}`);
      }
    }
  }

  showUpdateAvailableDialog(info) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const options = {
      type: 'info',
      title: 'Update Available',
      message: `School Bell System ${info.version} is available`,
      detail: `Current: ${app.getVersion()}\nNew: ${info.version}\n\nWould you like to download and install this update?`,
      buttons: ['Download Now', 'Later', 'Release Notes'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 0:
          autoUpdater.downloadUpdate();
          break;
        case 2:
          shell.openExternal(`https://github.com/AtizaD/school-bell-system/releases/tag/v${info.version}`);
          break;
      }
    });
  }

  showUpdateReadyDialog(info) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const options = {
      type: 'info',
      title: 'Update Ready',
      message: `School Bell System ${info.version} is ready to install`,
      detail: 'The update will be installed when you restart the application.',
      buttons: ['Restart Now', 'Restart Later'],
      defaultId: 0
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  }

  showUpdateDialog(title, message) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: title,
      message: message,
      buttons: ['OK']
    });
  }

  sendUpdateStatus(status, message, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, message, data });
    }
  }

  /**
   * Application menu
   */
  createAppMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Event',
            accelerator: 'CmdOrCtrl+N',
            click: () => this.sendMenuAction('new-event')
          },
          { type: 'separator' },
          {
            label: 'Upload Audio',
            accelerator: 'CmdOrCtrl+U',
            click: () => this.sendMenuAction('upload-audio')
          },
          { type: 'separator' },
          {
            label: 'Export Data',
            click: () => this.exportData()
          },
          {
            label: 'Import Data',
            click: () => this.importData()
          },
          { type: 'separator' },
          {
            label: 'Hide to Tray',
            accelerator: 'CmdOrCtrl+H',
            click: () => this.hideMainWindow()
          },
          {
            label: 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => this.showQuitConfirmation()
          }
        ]
      },
      {
        label: 'Audio',
        submenu: [
          {
            label: 'Stop All Audio',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: async () => {
              await this.audioPlayer.stop();
              this.showAudioNotification('All audio stopped');
            }
          },
          { type: 'separator' },
          {
            label: 'Audio Library',
            accelerator: 'CmdOrCtrl+L',
            click: () => this.sendMenuAction('audio-library')
          }
        ]
      },
      {
        label: 'Schedule',
        submenu: [
          {
            label: 'Today\'s Schedule',
            accelerator: 'CmdOrCtrl+T',
            click: () => this.sendMenuAction('today-schedule')
          },
          {
            label: 'Weekly View',
            accelerator: 'CmdOrCtrl+W',
            click: () => this.sendMenuAction('weekly-view')
          }
        ]
      },
      {
        label: 'System',
        submenu: [
          {
            label: 'Start with Windows',
            type: 'checkbox',
            checked: this.getAutoLaunchStatus(),
            click: (menuItem) => this.toggleAutoLaunch(menuItem.checked)
          },
          {
            label: 'Run in Background',
            type: 'checkbox',
            checked: true,
            enabled: false
          }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'Check for Updates',
            click: () => this.checkForUpdates(true)
          },
          { type: 'separator' },
          {
            label: 'User Guide',
            click: () => shell.openExternal('https://github.com/AtizaD/school-bell-system#readme')
          },
          {
            label: 'Report Issue',
            click: () => shell.openExternal('https://github.com/AtizaD/school-bell-system/issues')
          },
          { type: 'separator' },
          {
            label: 'About',
            click: () => this.showAboutDialog()
          }
        ]
      }
    ];

    // Development menu
    if (this.isDevelopment) {
      template.push({
        label: 'Development',
        submenu: [
          {
            label: 'Toggle DevTools',
            accelerator: 'F12',
            click: () => this.mainWindow?.webContents.toggleDevTools()
          },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => this.mainWindow?.webContents.reload()
          },
          { type: 'separator' },
          {
            label: 'Restart App',
            accelerator: 'CmdOrCtrl+Alt+R',
            click: () => {
              app.relaunch();
              app.quit();
            }
          }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  showAboutDialog() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const appVersion = app.getVersion();
    const electronVersion = process.versions.electron;
    const nodeVersion = process.versions.node;
    const platform = process.platform;
    const arch = process.arch;

    dialog.showMessageBox(this.mainWindow, {
      type: 'info',
      title: 'About School Bell System',
      message: 'School Bell Management System',
      detail: `Version: ${appVersion}\n` +
             `Platform: ${platform} (${arch})\n` +
             `Electron: ${electronVersion}\n` +
             `Node.js: ${nodeVersion}\n\n` +
             `Automated school bell scheduling with audio playback.\n\n` +
             `© 2025 AtizaD\n` +
             `Licensed under MIT License`,
      buttons: ['OK', 'GitHub'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 1) {
        shell.openExternal('https://github.com/AtizaD/school-bell-system');
      }
    });
  }

  /**
   * Quit confirmation and cleanup
   */
  showQuitConfirmation() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.confirmQuit();
      return;
    }

    const options = {
      type: 'question',
      title: 'Quit School Bell System',
      message: 'Are you sure you want to quit?',
      detail: 'This will stop all scheduled bell events until you restart the application.',
      buttons: ['Cancel', 'Minimize to Tray', 'Quit'],
      defaultId: 1,
      cancelId: 0
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 1: // Minimize to Tray
          this.hideMainWindow();
          this.showTrayNotification('Running in Background', 'School Bell System continues in the system tray');
          break;
        case 2: // Quit
          this.confirmQuit();
          break;
      }
    });
  }

  confirmQuit() {
    console.log('Confirming quit...');
    this.isQuitting = true;
    app.quit();
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up application resources...');

    try {
      // Clear intervals
      if (this.updateCheckInterval) {
        clearInterval(this.updateCheckInterval);
        this.updateCheckInterval = null;
      }

      // Cleanup modules
      if (this.audioPlayer) {
        await this.audioPlayer.cleanup();
      }

      if (this.scheduler) {
        this.scheduler.stop();
      }

      if (this.authManager) {
        this.authManager.cleanup();
      }

      // Log shutdown
      if (this.dataManager) {
        this.dataManager.logActivitySafe('app_shutdown', 'Application shutdown');
      }

      // Destroy tray
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }

      console.log('✅ Cleanup complete');

    } catch (error) {
      console.error('❌ Cleanup error:', error);
    }
  }

  /**
   * Error handlers
   */
  handleUncaughtException(error) {
    console.error('💥 Uncaught Exception:', error);
    
    if (this.dataManager) {
      this.dataManager.logActivitySafe('uncaught_exception', error.message, error.stack);
    }
    
    // Don't quit in production - try to recover
    if (!this.isDevelopment) {
      this.showTrayNotification('Error Detected', 'An error occurred but the app continues running');
    }
  }

  handleUnhandledRejection(reason, promise) {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    
    if (this.dataManager) {
      this.dataManager.logActivitySafe('unhandled_rejection', String(reason));
    }
  }

  showFatalError(title, message) {
    console.error(`💀 Fatal Error - ${title}: ${message}`);
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      dialog.showErrorBox(title, `${message}\n\nThe application will now close.`);
    }
  }

  /**
   * Session management
   */
  handleSessionExpired() {
    console.log('Session expired');
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session-expired');
    }
  }

  /**
   * IPC Communication
   */
  sendMenuAction(action) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('menu-action', action);
    }
  }

  showAudioNotification(message, isError = false) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('audio-notification', {
        message,
        type: isError ? 'error' : 'info'
      });
    }
  }

  /**
   * Data management
   */
  async exportData() {
    try {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

      const result = await dialog.showSaveDialog(this.mainWindow, {
        title: 'Export School Bell Data',
        defaultPath: `school-bell-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        const data = await this.dataManager.exportData();
        await fs.writeFile(result.filePath, data);
        
        dialog.showMessageBox(this.mainWindow, {
          type: 'info',
          title: 'Export Successful',
          message: 'Data exported successfully!',
          detail: `Data saved to: ${result.filePath}`
        });

        this.dataManager.logActivitySafe('data_exported', `Data exported to ${result.filePath}`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      if (!this.mainWindow?.isDestroyed()) {
        dialog.showErrorBox('Export Failed', `Failed to export data: ${error.message}`);
      }
    }
  }

  async importData() {
    try {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

      const result = await dialog.showOpenDialog(this.mainWindow, {
        title: 'Import School Bell Data',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (!result.canceled && result.filePaths.length > 0) {
        const confirmResult = await dialog.showMessageBox(this.mainWindow, {
          type: 'warning',
          title: 'Confirm Import',
          message: 'This will replace all current data!',
          detail: 'Are you sure? This action cannot be undone.',
          buttons: ['Cancel', 'Import'],
          defaultId: 0
        });

        if (confirmResult.response === 1) {
          const data = await fs.readFile(result.filePaths[0], 'utf8');
          await this.dataManager.importData(data);
          
          dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Import Successful',
            message: 'Data imported successfully!',
            detail: 'The application will reload.'
          });

          await this.scheduler.reloadSchedules();
          this.mainWindow.reload();
        }
      }
    } catch (error) {
      console.error('Import failed:', error);
      if (!this.mainWindow?.isDestroyed()) {
        dialog.showErrorBox('Import Failed', `Failed to import data: ${error.message}`);
      }
    }
  }

  /**
   * Setup IPC handlers
   */
  setupIPC() {
    console.log('Setting up IPC handlers...');

    // Data operations
    ipcMain.handle('data-get', async (event, section) => {
      return this.dataManager.getData(section);
    });

    ipcMain.handle('is-development-mode', () => {
      return this.isDevelopment;
    });

    // Schedule operations
    ipcMain.handle('schedule-get', async (event, day) => {
      return this.dataManager.getSchedule(day);
    });

    ipcMain.handle('schedule-add-event', async (event, day, eventData) => {
      const result = await this.dataManager.addScheduleEvent(day, eventData);
      await this.scheduler.addEvent(day, result);
      return result;
    });

    ipcMain.handle('schedule-update-event', async (event, day, eventId, updates) => {
      const result = await this.dataManager.updateScheduleEvent(day, eventId, updates);
      await this.scheduler.updateEvent(day, eventId, result);
      return result;
    });

    ipcMain.handle('schedule-delete-event', async (event, day, eventId) => {
      const result = await this.dataManager.deleteScheduleEvent(day, eventId);
      this.scheduler.removeEvent(day, eventId);
      return result;
    });

    // Audio operations
    ipcMain.handle('audio-get-files', async () => {
      return this.dataManager.getAudioFiles();
    });

    ipcMain.handle('audio-add-file', async (event, audioData) => {
      return await this.dataManager.addAudioFile(audioData);
    });

    ipcMain.handle('audio-delete-file', async (event, audioId) => {
      const audioFile = this.dataManager.getAudioFiles().find(a => a.id === audioId);
      if (audioFile) {
        try {
          const settings = this.dataManager.getSettings();
          const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
          const filePath = path.join(audioPath, audioFile.filename);
          await fs.unlink(filePath);
        } catch (fileError) {
          console.warn('Failed to delete audio file:', fileError.message);
        }
      }
      return await this.dataManager.deleteAudioFile(audioId);
    });

    ipcMain.handle('audio-bulk-delete', async (event, audioIds) => {
      const audioFiles = this.dataManager.getAudioFiles();
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      
      let deletedCount = 0;
      let errors = [];

      for (const audioId of audioIds) {
        try {
          const audioFile = audioFiles.find(a => a.id === audioId);
          
          if (audioFile) {
            // Try to delete the physical file
            try {
              const filePath = path.join(audioPath, audioFile.filename);
              await fs.unlink(filePath);
            } catch (fileError) {
              console.warn(`Failed to delete audio file ${audioFile.filename}:`, fileError.message);
              errors.push({
                id: audioId,
                filename: audioFile.filename,
                error: fileError.message
              });
            }

            // Remove from database
            await this.dataManager.deleteAudioFile(audioId);
            deletedCount++;
            
            this.dataManager.logActivitySafe('audio_file_deleted', `Bulk deleted: ${audioFile.name}`);
          } else {
            errors.push({
              id: audioId,
              error: 'Audio file not found in database'
            });
          }
        } catch (error) {
          console.error(`Failed to delete audio file ${audioId}:`, error);
          errors.push({
            id: audioId,
            error: error.message
          });
        }
      }

      const result = {
        success: true,
        deletedCount,
        totalRequested: audioIds.length,
        errors: errors.length > 0 ? errors : null
      };

      this.dataManager.logActivitySafe('audio_bulk_delete', 
        `Bulk delete completed: ${deletedCount}/${audioIds.length} files deleted`
      );

      return result;
    });

    ipcMain.handle('upload-audio-file', async (event, fileData) => {
      const { filename, buffer, displayName } = fileData;
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      
      await fs.mkdir(audioPath, { recursive: true });
      
      const filePath = path.join(audioPath, filename);
      
      // Check if file exists and handle overwrite
      let fileExists = false;
      try {
        await fs.access(filePath);
        fileExists = true;
        const overwrite = await this.confirmOverwrite(filename);
        
        if (!overwrite) {
          throw new Error('Upload cancelled - file already exists');
        }
      } catch (accessError) {
        // File doesn't exist, continue
        if (accessError.code !== 'ENOENT') {
          throw new Error(`Cannot access file location: ${accessError.message}`);
        }
      }
      
      // If file exists and we're overwriting, stop any audio that might be using it
      if (fileExists) {
        try {
          await this.audioPlayer.stop();
        } catch (stopError) {
          console.warn('Failed to stop audio player before overwrite:', stopError.message);
        }
      }
      
      // Try to write the file with better error handling
      try {
        await fs.writeFile(filePath, buffer);
      } catch (writeError) {
        if (writeError.code === 'EPERM') {
          throw new Error(`Permission denied. The file "${filename}" may be in use by another application or you don't have write permissions to this location.`);
        } else if (writeError.code === 'EACCES') {
          throw new Error(`Access denied. Check file permissions for "${filename}".`);
        } else if (writeError.code === 'EBUSY') {
          throw new Error(`File "${filename}" is currently in use. Please close any applications using this file and try again.`);
        } else {
          throw new Error(`Failed to write file "${filename}": ${writeError.message}`);
        }
      }
      const stats = await fs.stat(filePath);
      
      const audioData = {
        name: displayName,
        filename: filename,
        size: stats.size,
        type: this.getFileType(filename),
        duration: 0,
        uploadedAt: new Date().toISOString()
      };
      
      // Check if we're replacing an existing file
      let result;
      if (fileExists) {
        // Find existing audio file record and update it
        const existingAudio = this.dataManager.getAudioFiles().find(af => af.filename === filename);
        if (existingAudio) {
          // Update existing record
          result = await this.dataManager.updateAudioFile(existingAudio.id, audioData);
          this.dataManager.logActivitySafe('audio_file_replaced', `Replaced audio file "${displayName}"`);
        } else {
          // File exists on disk but not in database, add new record
          result = await this.dataManager.addAudioFile(audioData);
        }
      } else {
        // New file, add to database
        result = await this.dataManager.addAudioFile(audioData);
      }
      this.dataManager.logActivitySafe('audio_file_uploaded', `Uploaded: ${displayName}`);
      
      return result;
    });

    // Template operations
    ipcMain.handle('template-get-all', async () => {
      return this.dataManager.getTemplates();
    });

    ipcMain.handle('template-add', async (event, templateData) => {
      return await this.dataManager.addTemplate(templateData);
    });

    ipcMain.handle('template-delete', async (event, templateId) => {
      return await this.dataManager.deleteTemplate(templateId);
    });

    // Settings operations
    ipcMain.handle('settings-get', async () => {
      return this.dataManager.getSettings();
    });

    ipcMain.handle('settings-update', async (event, updates) => {
      const result = await this.dataManager.updateSettings(updates);
      this.audioPlayer.updateSettings(updates);
      return result;
    });

    // Log operations
    ipcMain.handle('logs-get', async (event, limit) => {
      return this.dataManager.getLogs(limit);
    });

    ipcMain.handle('logs-clear', async () => {
      return await this.dataManager.clearLogs();
    });

    // Dialog operations
    ipcMain.handle('show-save-dialog', async (event, options) => {
      return await dialog.showSaveDialog(this.mainWindow, options);
    });

    ipcMain.handle('show-open-dialog', async (event, options) => {
      return await dialog.showOpenDialog(this.mainWindow, options);
    });

    // Audio player operations
    ipcMain.handle('audio-test', async (event, filename) => {
      return await this.audioPlayer.testAudio(filename);
    });

    ipcMain.handle('audio-stop-test', async () => {
      return await this.audioPlayer.stopTestAudio();
    });

    ipcMain.handle('audio-stop-all', async () => {
      return await this.audioPlayer.stop();
    });

    ipcMain.handle('audio-set-volume', async (event, volume) => {
      await this.audioPlayer.setVolume(volume);
      await this.dataManager.updateSettings({ volume: volume });
      return this.audioPlayer.getVolume();
    });

    ipcMain.handle('audio-get-available-files', async () => {
      return await this.audioPlayer.getAvailableAudioFiles();
    });

    ipcMain.handle('audio-get-status', async () => {
      return this.audioPlayer.getPlayingStatus();
    });

    ipcMain.handle('audio-test-system', async () => {
      return await this.audioPlayer.testSystemAudio();
    });

    ipcMain.handle('audio-get-file-url', async (event, filename) => {
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      const filePath = path.join(audioPath, filename);
      
      try {
        await fs.access(filePath);
        
        // Read the file as base64 and create a data URL
        const fileBuffer = await fs.readFile(filePath);
        const fileExtension = path.extname(filename).toLowerCase();
        
        // Map file extensions to MIME types
        const mimeTypes = {
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
          '.ogg': 'audio/ogg',
          '.aac': 'audio/aac'
        };
        
        const mimeType = mimeTypes[fileExtension] || 'audio/mpeg';
        const base64Data = fileBuffer.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64Data}`;
        
        return { url: dataUrl };
      } catch (error) {
        throw new Error(`Audio file not found: ${filename}`);
      }
    });

    ipcMain.handle('audio-get-file-path', async (event, filename) => {
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(app.getPath('userData'), 'audio');
      const filePath = path.join(audioPath, filename);
      
      try {
        await fs.access(filePath);
        return filePath;
      } catch (error) {
        throw new Error(`Audio file not found: ${filename}`);
      }
    });

    ipcMain.handle('audio-play-scheduled', async (event, eventData) => {
      // This handler triggers HTML5 audio playback in the renderer process
      // Send event to renderer to play the scheduled audio using HTML5
      this.mainWindow.webContents.send('scheduled-audio', eventData);
      return { success: true };
    });

    // Scheduler operations
    ipcMain.handle('scheduler-get-status', async () => {
      return this.scheduler.getStatus();
    });

    ipcMain.handle('scheduler-test-event', async (event, day, eventData) => {
      return await this.scheduler.testEvent(day, eventData);
    });

    ipcMain.handle('scheduler-reload', async () => {
      await this.scheduler.reloadSchedules();
      return true;
    });

    ipcMain.handle('scheduler-start', async () => {
      this.scheduler.start();
      return true;
    });

    ipcMain.handle('scheduler-stop', async () => {
      this.scheduler.stop();
      return true;
    });

    ipcMain.handle('scheduler-get-next-events', async (event, limit) => {
      return this.scheduler.getNextEvents(limit || 5);
    });

    ipcMain.handle('scheduler-get-today-events', async () => {
      return this.scheduler.getTodayEvents();
    });

    // Authentication operations
    ipcMain.handle('auth-is-setup-complete', async () => {
      return await this.authManager.isSetupComplete();
    });

    ipcMain.handle('auth-create-admin', async (event, username, password) => {
      return await this.authManager.createAdminUser(username, password);
    });

    ipcMain.handle('auth-login', async (event, username, password) => {
      const result = await this.authManager.login(username, password);
      if (result.success) {
        this.dataManager.logActivitySafe('user_login', `User ${username} logged in`);
      }
      return result;
    });

    ipcMain.handle('auth-logout', async () => {
      const session = this.authManager.getCurrentSession();
      const result = this.authManager.logout();
      if (session) {
        this.dataManager.logActivitySafe('user_logout', `User ${session.username} logged out`);
      }
      return result;
    });

    ipcMain.handle('auth-is-logged-in', async () => {
      return this.authManager.isLoggedIn();
    });

    ipcMain.handle('auth-get-session', async () => {
      return this.authManager.getCurrentSession();
    });

    ipcMain.handle('auth-update-activity', async () => {
      this.authManager.updateActivity();
      return { success: true };
    });

    ipcMain.handle('auth-get-admin-info', async () => {
      return await this.authManager.getAdminInfo();
    });

    ipcMain.handle('auth-change-password', async (event, currentPassword, newPassword) => {
      try {
        if (this.isDevelopment) {
          console.log('🔑 [DEV] Password change request received');
          console.log('🔑 [DEV] Current password provided:', !!currentPassword);
          console.log('🔑 [DEV] New password provided:', !!newPassword);
        }
        
        const result = await this.authManager.changePassword(currentPassword, newPassword);
        
        if (this.isDevelopment) {
          console.log('🔑 [DEV] Password change result:', result);
        }
        
        if (result.success) {
          this.dataManager.logActivitySafe('password_changed', 'Admin password changed successfully');
        }
        return result;
      } catch (error) {
        if (this.isDevelopment) {
          console.error('🔑 [DEV] Password change error details:', error);
          console.error('🔑 [DEV] Error stack:', error.stack);
        } else {
          console.error('Password change failed:', error.message);
        }
        return {
          success: false,
          error: error.message || 'Failed to change password'
        };
      }
    });

    // System operations
    ipcMain.handle('system-get-auto-launch-status', async () => {
      return this.getAutoLaunchStatus();
    });

    ipcMain.handle('system-toggle-auto-launch', async (event, enable) => {
      await this.toggleAutoLaunch(enable);
      return { success: true, enabled: enable };
    });

    ipcMain.handle('system-show-main-window', async () => {
      this.showMainWindow();
      return { success: true };
    });

    ipcMain.handle('system-hide-main-window', async () => {
      this.hideMainWindow();
      return { success: true };
    });

    ipcMain.handle('system-quit-app', async () => {
      this.confirmQuit();
      return { success: true };
    });

    // Updater operations
    ipcMain.handle('updater-check-for-updates', async () => {
      return await this.checkForUpdates(true);
    });

    ipcMain.handle('updater-download-update', async () => {
      autoUpdater.downloadUpdate();
      return { success: true };
    });

    ipcMain.handle('updater-install-update', async () => {
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    });

    ipcMain.handle('updater-get-version', async () => {
      return {
        current: app.getVersion(),
        isDevelopment: this.isDevelopment,
        updateAvailable: this.updateAvailable
      };
    });

    ipcMain.handle('updater-restart-app', async () => {
      app.relaunch();
      app.quit();
      return { success: true };
    });

    console.log('✅ IPC handlers configured');
  }

  /**
   * Utility methods
   */
  getFileType(filename) {
    const extension = path.extname(filename).toLowerCase();
    const typeMap = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/m4a',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac'
    };
    return typeMap[extension] || 'audio/mpeg';
  }

  async confirmOverwrite(filename) {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        // Bring main window to front first
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
        
        const result = await dialog.showMessageBox(this.mainWindow, {
          type: 'warning',
          title: 'Replace Existing File?',
          message: `The file "${filename}" already exists.`,
          detail: 'Do you want to replace the existing file with the new one? This action cannot be undone.',
          buttons: ['Cancel', 'Replace File'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        
        return result.response === 1;
      }
      return false;
    } catch (error) {
      console.error('Error showing overwrite confirmation:', error);
      return false;
    }
  }
}

// Initialize application
const schoolBellApp = new SchoolBellApp();

// Start the application
schoolBellApp.initialize();

// Handle macOS activation
app.on('activate', () => {
  if (schoolBellApp.mainWindow === null) {
    schoolBellApp.createMainWindow();
  }
});

// Graceful shutdown
process.on('exit', () => {
  console.log('🔔 School Bell System shutting down...');
  schoolBellApp.cleanup();
});

console.log('🔔 School Bell System - Production Main Process Started');