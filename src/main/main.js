const { app, BrowserWindow, ipcMain, dialog, Menu, shell, Tray, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs').promises;
const DataManager = require('./data-manager');
const AudioPlayer = require('./audio-player');
const Scheduler = require('./scheduler');
const AuthManager = require('./auth-manager');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--no-sandbox');

class SchoolBellApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.dataManager = null;
    this.audioPlayer = null;
    this.scheduler = null;
    this.authManager = null;
    this.isDevelopment = process.argv.includes('--dev');
    this.isInitialized = false;
    this.isQuitting = false;
    
    // Auto-updater configuration
    this.updateCheckInterval = null;
    this.updateAvailable = false;
    
    // Configure auto-updater
    this.configureAutoUpdater();
  }

  configureAutoUpdater() {
    // Configure auto-updater settings
    autoUpdater.autoDownload = false; // Don't auto-download, ask user first
    autoUpdater.autoInstallOnAppQuit = true;
    
    // Set update check interval (check every 4 hours)
    if (!this.isDevelopment) {
      this.updateCheckInterval = setInterval(() => {
        this.checkForUpdates(false); // Silent check
      }, 4 * 60 * 60 * 1000); // 4 hours
    }

    // Auto-updater event handlers
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

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available');
      this.updateAvailable = false;
      this.sendUpdateStatus('not-available', 'You are using the latest version');
    });

    autoUpdater.on('error', (err) => {
      console.error('Auto-updater error:', err);
      this.sendUpdateStatus('error', `Update error: ${err.message}`);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const { bytesPerSecond, percent, transferred, total } = progressObj;
      const message = `Download speed: ${Math.round(bytesPerSecond / 1024)} KB/s - Downloaded ${Math.round(percent)}% (${Math.round(transferred / 1024 / 1024)}MB/${Math.round(total / 1024 / 1024)}MB)`;
      console.log(message);
      this.sendUpdateStatus('downloading', message, { percent, bytesPerSecond, transferred, total });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      this.sendUpdateStatus('downloaded', `Update ${info.version} downloaded and ready to install`);
      this.showUpdateReadyDialog(info);
    });
  }

  async checkForUpdates(showNoUpdateDialog = true) {
    if (this.isDevelopment) {
      if (showNoUpdateDialog) {
        this.showUpdateDialog('Development Mode', 'Update checking is disabled in development mode.');
      }
      return;
    }

    try {
      console.log('Manually checking for updates...');
      this.sendUpdateStatus('checking', 'Checking for updates...');
      
      const result = await autoUpdater.checkForUpdates();
      
      if (showNoUpdateDialog && !this.updateAvailable) {
        setTimeout(() => {
          if (!this.updateAvailable) {
            this.showUpdateDialog('No Updates', 'You are already using the latest version of School Bell System.');
          }
        }, 3000); // Wait 3 seconds to see if update is found
      }
      
      return result;
    } catch (error) {
      console.error('Manual update check failed:', error);
      this.sendUpdateStatus('error', `Update check failed: ${error.message}`);
      
      if (showNoUpdateDialog) {
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
      detail: `Current version: ${app.getVersion()}\nNew version: ${info.version}\n\nRelease date: ${new Date(info.releaseDate).toLocaleDateString()}\n\nWould you like to download and install this update?`,
      buttons: ['Download Now', 'Download Later', 'View Release Notes'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 0: // Download Now
          this.downloadUpdate();
          break;
        case 1: // Download Later
          this.sendUpdateStatus('postponed', 'Update postponed');
          break;
        case 2: // View Release Notes
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
      detail: 'The update has been downloaded and is ready to install. The application will restart to complete the installation.',
      buttons: ['Install and Restart', 'Install on Exit'],
      defaultId: 0,
      cancelId: 1
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      if (result.response === 0) {
        // Install and restart immediately
        this.installUpdate();
      } else {
        // Install on exit (this is automatic with autoInstallOnAppQuit = true)
        this.sendUpdateStatus('ready', 'Update will be installed when you close the application');
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

  downloadUpdate() {
    try {
      console.log('Starting update download...');
      this.sendUpdateStatus('downloading', 'Downloading update...');
      autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Failed to download update:', error);
      this.sendUpdateStatus('error', `Download failed: ${error.message}`);
    }
  }

  installUpdate() {
    try {
      console.log('Installing update and restarting...');
      this.sendUpdateStatus('installing', 'Installing update and restarting...');
      autoUpdater.quitAndInstall(false, true); // Don't force close, do restart
    } catch (error) {
      console.error('Failed to install update:', error);
      this.sendUpdateStatus('error', `Installation failed: ${error.message}`);
    }
  }

  sendUpdateStatus(status, message, data = null) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, message, data });
    }
  }

  async initialize() {
    try {
      if (this.isInitialized) return;

      this.authManager = new AuthManager();
      
      // Set up session expired callback
      this.authManager.onSessionExpired = () => {
        this.handleSessionExpired();
      };

      this.dataManager = new DataManager();
      await this.dataManager.initialize();
      
      this.audioPlayer = new AudioPlayer(this.dataManager);
      await this.audioPlayer.init();
      
      this.scheduler = new Scheduler(this.dataManager, this.audioPlayer);
      await this.scheduler.init();
      
      this.setupApp();
      this.setupIPC();
      
      this.isInitialized = true;
      
      // Check for updates on startup (after 5 seconds delay)
      setTimeout(() => {
        if (!this.isDevelopment) {
          this.checkForUpdates(false); // Silent check on startup
        }
      }, 5000);
      
    } catch (error) {
      dialog.showErrorBox('Initialization Error', 
        `Failed to initialize the School Bell System.\n\nError: ${error.message}\n\nThe application will now close.`);
      app.quit();
    }
  }

  setupApp() {
    app.whenReady().then(() => {
      this.createSystemTray();
      this.createMainWindow();
      this.createAppMenu();
      this.setupAutoLaunch();
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      // Don't quit the app when all windows are closed
      // Keep running in background via system tray
      if (process.platform !== 'darwin') {
        // On macOS, keep the app running even when no windows are open
        // On Windows/Linux, keep running in system tray
      }
    });

    app.on('before-quit', async (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.showQuitConfirmation();
        return;
      }
      
      try {
        // Clear update check interval
        if (this.updateCheckInterval) {
          clearInterval(this.updateCheckInterval);
        }
        
        if (this.audioPlayer) await this.audioPlayer.cleanup();
        if (this.scheduler) this.scheduler.stop();
        if (this.authManager) this.authManager.cleanup();
        if (this.dataManager) this.dataManager.logActivitySafe('app_shutdown', 'Application shutdown');
      } catch (error) {
        // Silent cleanup
      }
    });
  }

  createSystemTray() {
    try {
      // Use static tray icon file
      const trayIconPath = this.isDevelopment 
        ? path.join(__dirname, '../../build/tray-icon.png')
        : path.join(process.resourcesPath, 'tray-icon.png');
      
      // Check if tray icon exists, fallback to app icon
      let trayIcon;
      try {
        trayIcon = nativeImage.createFromPath(trayIconPath);
        if (trayIcon.isEmpty()) {
          throw new Error('Tray icon is empty');
        }
      } catch (iconError) {
        console.warn('Custom tray icon not found, using default icon');
        // Create a simple 16x16 bell icon programmatically
        trayIcon = this.createSimpleTrayIcon();
      }
      
      this.tray = new Tray(trayIcon);
      
      // Set tray tooltip
      this.tray.setToolTip('School Bell System - Running in background');
      
      // Create tray context menu
      this.updateTrayMenu();
      
      // Double click to show/hide main window
      this.tray.on('double-click', () => {
        this.toggleMainWindow();
      });
      
      console.log('System tray created successfully');
      
    } catch (error) {
      console.warn('Failed to create system tray:', error.message);
      // App can still function without tray
    }
  }

  createSimpleTrayIcon() {
    // Create a simple programmatic icon as fallback
    // 16x16 bitmap with bell pattern
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

  updateTrayMenu() {
    if (!this.tray) return;
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'School Bell System',
        type: 'normal',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => this.showMainWindow()
      },
      {
        label: 'Hide Window', 
        click: () => this.hideMainWindow()
      },
      { type: 'separator' },
      {
        label: 'Next Events',
        submenu: this.createNextEventsSubmenu()
      },
      {
        label: 'Quick Actions',
        submenu: [
          {
            label: 'Stop All Audio',
            click: async () => {
              if (this.audioPlayer) {
                await this.audioPlayer.stop();
                this.showTrayNotification('Audio Stopped', 'All audio playback stopped');
              }
            }
          },
          {
            label: 'Reload Schedules',
            click: async () => {
              if (this.scheduler) {
                await this.scheduler.reloadSchedules();
                this.showTrayNotification('Schedules Reloaded', 'All schedules have been reloaded');
              }
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Settings',
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
            enabled: false // Always enabled for bell system
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Quit School Bell System',
        click: () => this.confirmQuit()
      }
    ]);
    
    this.tray.setContextMenu(contextMenu);
  }

  createNextEventsSubmenu() {
    try {
      if (!this.scheduler) {
        return [{ label: 'No events scheduled', enabled: false }];
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

  formatTimeUntil(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    } else if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    } else {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
  }

  showTrayNotification(title, body) {
    if (this.tray) {
      this.tray.displayBalloon({
        title: title,
        content: body,
        icon: this.tray.getImage()
      });
    }
  }

  toggleMainWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideMainWindow();
      } else {
        this.showMainWindow();
      }
    } else {
      this.createMainWindow();
    }
  }

  showMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    } else {
      this.createMainWindow();
    }
  }

  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  async setupAutoLaunch() {
    try {
      const AutoLaunch = require('auto-launch');
      
      this.autoLauncher = new AutoLaunch({
        name: 'School Bell System',
        path: app.getPath('exe'),
        isHidden: false // Set to true to start minimized
      });
      
      // Check if auto-launch is already enabled
      const isEnabled = await this.autoLauncher.isEnabled();
      console.log('Auto-launch status:', isEnabled);
      
      // Enable auto-launch by default for bell system
      const settings = this.dataManager?.getSettings();
      if (settings?.autoStart !== false && !isEnabled) {
        await this.enableAutoLaunch();
      }
      
    } catch (error) {
      console.warn('Auto-launch setup failed:', error.message);
      // App can still function without auto-launch
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
      if (this.autoLauncher) {
        return this.autoLauncher.isEnabled();
      }
    } catch (error) {
      console.warn('Failed to get auto-launch status:', error);
    }
    return false;
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
    
    // Update tray menu
    this.updateTrayMenu();
  }

  showQuitConfirmation() {
    const options = {
      type: 'question',
      title: 'Quit School Bell System',
      message: 'Are you sure you want to quit School Bell System?',
      detail: 'Quitting will stop all scheduled bell events until you restart the application.',
      buttons: ['Cancel', 'Minimize to Tray', 'Quit Completely'],
      defaultId: 1,
      cancelId: 0
    };

    dialog.showMessageBox(this.mainWindow, options).then((result) => {
      switch (result.response) {
        case 0: // Cancel
          break;
        case 1: // Minimize to Tray
          this.hideMainWindow();
          this.showTrayNotification('Running in Background', 'School Bell System is still running in the system tray');
          break;
        case 2: // Quit Completely
          this.confirmQuit();
          break;
      }
    });
  }

  confirmQuit() {
    this.isQuitting = true;
    
    if (this.tray) {
      this.tray.destroy();
    }
    
    app.quit();
  }

  handleSessionExpired() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('session-expired');
    }
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 700,
      icon: path.join(__dirname, '../renderer/assets/icons/icon.png'),
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

    this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow.show();
      
      // Show app version in title
      const currentVersion = app.getVersion();
      this.mainWindow.setTitle(`School Bell System v${currentVersion}`);
    });

    // Handle window close - minimize to tray instead of quitting
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.hideMainWindow();
        
        // Show notification on first minimize
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

  createAppMenu() {
    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Schedule Event',
            accelerator: 'CmdOrCtrl+N',
            click: () => this.sendMenuAction('new-event')
          },
          { type: 'separator' },
          {
            label: 'Upload Audio File',
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
            label: 'Show in System Tray',
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
            click: () => {
              shell.openExternal('https://github.com/AtizaD/school-bell-system#readme');
            }
          },
          {
            label: 'Report Issue',
            click: () => {
              shell.openExternal('https://github.com/AtizaD/school-bell-system/issues');
            }
          },
          {
            label: 'View on GitHub',
            click: () => {
              shell.openExternal('https://github.com/AtizaD/school-bell-system');
            }
          },
          { type: 'separator' },
          {
            label: 'About School Bell System',
            click: () => {
              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                const appVersion = app.getVersion();
                const electronVersion = process.versions.electron;
                const nodeVersion = process.versions.node;
                const chromeVersion = process.versions.chrome;
                const platform = process.platform;
                const arch = process.arch;
                
                dialog.showMessageBox(this.mainWindow, {
                  type: 'info',
                  title: 'About School Bell System',
                  message: 'School Bell Management System',
                  detail: `Version: ${appVersion}\n` +
                         `Build: ${this.isDevelopment ? 'Development' : 'Production'}\n` +
                         `Platform: ${platform} (${arch})\n\n` +
                         `Runtime Information:\n` +
                         `• Electron: ${electronVersion}\n` +
                         `• Node.js: ${nodeVersion}\n` +
                         `• Chrome: ${chromeVersion}\n\n` +
                         `Automated school bell scheduling system with audio playback control.\n\n` +
                         `© 2025 AtizaD\n` +
                         `Licensed under MIT License\n\n` +
                         `GitHub: https://github.com/AtizaD/school-bell-system`,
                  buttons: ['OK', 'Visit GitHub'],
                  defaultId: 0
                }).then((result) => {
                  if (result.response === 1) {
                    shell.openExternal('https://github.com/AtizaD/school-bell-system');
                  }
                });
              }
            }
          }
        ]
      }
    ];

    if (this.isDevelopment) {
      template.push({
        label: 'Development',
        submenu: [
          {
            label: 'Toggle DevTools',
            accelerator: 'F12',
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.webContents.toggleDevTools();
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Reload',
            accelerator: 'CmdOrCtrl+R',
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.webContents.reload();
              }
            }
          },
          {
            label: 'Force Reload',
            accelerator: 'CmdOrCtrl+Shift+R',
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.webContents.reloadIgnoringCache();
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Test Update Check',
            click: () => this.checkForUpdates(true)
          },
          {
            label: 'Reset App Data',
            click: async () => {
              const result = await dialog.showMessageBox(this.mainWindow, {
                type: 'warning',
                title: 'Reset App Data',
                message: 'This will clear all data and restart the app',
                detail: 'This action cannot be undone. Continue?',
                buttons: ['Cancel', 'Reset'],
                defaultId: 0,
                cancelId: 0
              });
              
              if (result.response === 1) {
                try {
                  await this.dataManager.importData(JSON.stringify(this.dataManager.defaultData));
                  this.mainWindow.reload();
                } catch (error) {
                  dialog.showErrorBox('Reset Failed', error.message);
                }
              }
            }
          },
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

    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

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

  setupIPC() {
    // Existing IPC handlers...
    ipcMain.handle('data-get', async (event, section) => {
      return this.dataManager.getData(section);
    });

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
          const audioPath = settings.audioPath || path.join(process.cwd(), 'audio');
          const filePath = path.join(audioPath, audioFile.filename);
          await fs.unlink(filePath);
        } catch (fileError) {
          // Silent file cleanup failure
        }
      }
      return await this.dataManager.deleteAudioFile(audioId);
    });

    ipcMain.handle('upload-audio-file', async (event, fileData) => {
      const { filename, buffer, displayName } = fileData;
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(process.cwd(), 'audio');
      
      await fs.mkdir(audioPath, { recursive: true });
      
      const filePath = path.join(audioPath, filename);
      
      try {
        await fs.access(filePath);
        const overwrite = await this.confirmOverwrite(filename);
        if (!overwrite) {
          throw new Error('Upload cancelled - file already exists');
        }
      } catch (accessError) {
        // File doesn't exist, continue
      }
      
      await fs.writeFile(filePath, buffer);
      const stats = await fs.stat(filePath);
      
      const audioData = {
        name: displayName,
        filename: filename,
        size: stats.size,
        type: this.getFileType(filename),
        duration: 0,
        uploadedAt: new Date().toISOString()
      };
      
      const result = await this.dataManager.addAudioFile(audioData);
      this.dataManager.logActivitySafe('audio_file_uploaded', `Uploaded: ${displayName}`);
      
      return result;
    });

    ipcMain.handle('template-get-all', async () => {
      return this.dataManager.getTemplates();
    });

    ipcMain.handle('template-add', async (event, templateData) => {
      return await this.dataManager.addTemplate(templateData);
    });

    ipcMain.handle('template-delete', async (event, templateId) => {
      return await this.dataManager.deleteTemplate(templateId);
    });

    ipcMain.handle('settings-get', async () => {
      return this.dataManager.getSettings();
    });

    ipcMain.handle('settings-update', async (event, updates) => {
      const result = await this.dataManager.updateSettings(updates);
      this.audioPlayer.updateSettings(updates);
      return result;
    });

    ipcMain.handle('logs-get', async (event, limit) => {
      return this.dataManager.getLogs(limit);
    });

    ipcMain.handle('logs-clear', async () => {
      return await this.dataManager.clearLogs();
    });

    ipcMain.handle('show-save-dialog', async (event, options) => {
      return await dialog.showSaveDialog(this.mainWindow, options);
    });

    ipcMain.handle('show-open-dialog', async (event, options) => {
      return await dialog.showOpenDialog(this.mainWindow, options);
    });

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
      this.audioPlayer.setVolume(volume);
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
      const result = await this.authManager.changePassword(currentPassword, newPassword);
      if (result.success) {
        this.dataManager.logActivitySafe('password_changed', 'Admin password changed');
      }
      return result;
    });

    ipcMain.handle('auth-reset-setup', async () => {
      if (this.isDevelopment) {
        const result = await this.authManager.resetSetup();
        this.dataManager.logActivitySafe('setup_reset', 'Authentication setup reset (development mode)');
        return result;
      } else {
        throw new Error('Reset setup is only available in development mode');
      }
    });

    // Password recovery handlers
    ipcMain.handle('auth-generate-recovery-token', async () => {
      return await this.authManager.generateRecoveryToken();
    });

    ipcMain.handle('auth-reset-password-with-token', async (event, recoveryToken, newPassword) => {
      return await this.authManager.resetPasswordWithToken(recoveryToken, newPassword);
    });

    ipcMain.handle('auth-emergency-reset', async () => {
      if (this.isDevelopment) {
        return await this.authManager.emergencyReset();
      } else {
        throw new Error('Emergency reset only available in development mode');
      }
    });

    ipcMain.handle('auth-emergency-login', async (event, emergencyCode) => {
      return await this.authManager.emergencyLogin(emergencyCode);
    });

    // AUTO-UPDATER IPC HANDLERS
    ipcMain.handle('updater-check-for-updates', async () => {
      return await this.checkForUpdates(true);
    });

    ipcMain.handle('updater-download-update', async () => {
      this.downloadUpdate();
      return { success: true };
    });

    ipcMain.handle('updater-install-update', async () => {
      this.installUpdate();
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

    // SYSTEM TRAY AND STARTUP IPC HANDLERS
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
  }

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
        const result = await dialog.showMessageBox(this.mainWindow, {
          type: 'question',
          title: 'File Already Exists',
          message: `The file "${filename}" already exists.`,
          detail: 'Do you want to replace it?',
          buttons: ['Cancel', 'Replace'],
          defaultId: 0,
          cancelId: 0
        });
        return result.response === 1;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

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
      if (!this.mainWindow.isDestroyed()) {
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
          detail: 'Are you sure you want to import this data? This action cannot be undone.',
          buttons: ['Cancel', 'Import'],
          defaultId: 0,
          cancelId: 0
        });

        if (confirmResult.response === 1) {
          const data = await fs.readFile(result.filePaths[0], 'utf8');
          await this.dataManager.importData(data);
          
          dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Import Successful',
            message: 'Data imported successfully!',
            detail: 'The application will reload to reflect the changes.'
          });

          try {
            await this.scheduler.reloadSchedules();
          } catch (error) {
            // Silent scheduler reload failure
          }

          this.mainWindow.reload();
        }
      }
    } catch (error) {
      if (!this.mainWindow.isDestroyed()) {
        dialog.showErrorBox('Import Failed', `Failed to import data: ${error.message}`);
      }
    }
  }
}

const schoolBellApp = new SchoolBellApp();
schoolBellApp.initialize();

app.on('activate', () => {
  if (schoolBellApp.mainWindow === null) {
    schoolBellApp.createMainWindow();
  }
});