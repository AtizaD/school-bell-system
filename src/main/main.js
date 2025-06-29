const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
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
    this.dataManager = null;
    this.audioPlayer = null;
    this.scheduler = null;
    this.authManager = null;
    this.isDevelopment = process.argv.includes('--dev');
    this.isInitialized = false;
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
      
    } catch (error) {
      dialog.showErrorBox('Initialization Error', 
        `Failed to initialize the School Bell System.\n\nError: ${error.message}\n\nThe application will now close.`);
      app.quit();
    }
  }

  setupApp() {
    app.whenReady().then(() => {
      this.createMainWindow();
      this.createAppMenu();
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', async () => {
      try {
        if (this.audioPlayer) await this.audioPlayer.cleanup();
        if (this.scheduler) this.scheduler.stop();
        if (this.authManager) this.authManager.cleanup();
        if (this.dataManager) this.dataManager.logActivitySafe('app_shutdown', 'Application shutdown');
      } catch (error) {
        // Silent cleanup
      }
    });
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
            label: 'Exit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => app.quit()
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

    template.push({
      label: 'Help',
      submenu: [
        {
          label: 'User Guide',
          click: () => {
            shell.openExternal('https://github.com');
          }
        },
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
                       `Build: Production\n` +
                       `Platform: ${platform} (${arch})\n\n` +
                       `Runtime Information:\n` +
                       `• Electron: ${electronVersion}\n` +
                       `• Node.js: ${nodeVersion}\n` +
                       `• Chrome: ${chromeVersion}\n\n` +
                       `Automated school bell scheduling system with audio playback control.\n\n` +
                       `© 2025 School Bell System\n` +
                       `Licensed under MIT License`,
                buttons: ['OK']
              });
            }
          }
        }
      ]
    });

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

    // FIXED: Password recovery handlers moved INSIDE setupIPC()
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