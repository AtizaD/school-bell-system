const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  
  getData: (section) => ipcRenderer.invoke('data-get', section),
  
  getSchedule: (day) => ipcRenderer.invoke('schedule-get', day),
  addScheduleEvent: (day, eventData) => ipcRenderer.invoke('schedule-add-event', day, eventData),
  updateScheduleEvent: (day, eventId, updates) => ipcRenderer.invoke('schedule-update-event', day, eventId, updates),
  deleteScheduleEvent: (day, eventId) => ipcRenderer.invoke('schedule-delete-event', day, eventId),
  
  getAudioFiles: () => ipcRenderer.invoke('audio-get-files'),
  addAudioFile: (audioData) => ipcRenderer.invoke('audio-add-file', audioData),
  deleteAudioFile: (audioId) => ipcRenderer.invoke('audio-delete-file', audioId),
  bulkDeleteAudioFiles: (audioIds) => ipcRenderer.invoke('audio-bulk-delete', audioIds),
  uploadAudioFile: (fileData) => ipcRenderer.invoke('upload-audio-file', fileData),
  
  getTemplates: () => ipcRenderer.invoke('template-get-all'),
  addTemplate: (templateData) => ipcRenderer.invoke('template-add', templateData),
  deleteTemplate: (templateId) => ipcRenderer.invoke('template-delete', templateId),
  
  getSettings: () => ipcRenderer.invoke('settings-get'),
  updateSettings: (updates) => ipcRenderer.invoke('settings-update', updates),
  
  getLogs: (limit) => ipcRenderer.invoke('logs-get', limit),
  clearLogs: () => ipcRenderer.invoke('logs-clear'),
  
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  testAudio: (filename) => ipcRenderer.invoke('audio-test', filename),
  stopTestAudio: () => ipcRenderer.invoke('audio-stop-test'),
  stopAllAudio: () => ipcRenderer.invoke('audio-stop-all'),
  setVolume: (volume) => ipcRenderer.invoke('audio-set-volume', volume),
  getAvailableAudioFiles: () => ipcRenderer.invoke('audio-get-available-files'),
  getAudioStatus: () => ipcRenderer.invoke('audio-get-status'),
  testSystemAudio: () => ipcRenderer.invoke('audio-test-system'),
  getAudioFileUrl: (filename) => ipcRenderer.invoke('audio-get-file-url', filename),
  getAudioFilePath: (filename) => ipcRenderer.invoke('audio-get-file-path', filename),
  playScheduledAudio: (eventData) => ipcRenderer.invoke('audio-play-scheduled', eventData),
  
  getSchedulerStatus: () => ipcRenderer.invoke('scheduler-get-status'),
  testEvent: (day, eventData) => ipcRenderer.invoke('scheduler-test-event', day, eventData),
  reloadScheduler: () => ipcRenderer.invoke('scheduler-reload'),
  startScheduler: () => ipcRenderer.invoke('scheduler-start'),
  stopScheduler: () => ipcRenderer.invoke('scheduler-stop'),
  getNextEvents: (limit) => ipcRenderer.invoke('scheduler-get-next-events', limit),
  getTodayEvents: () => ipcRenderer.invoke('scheduler-get-today-events'),
  
  // Authentication operations
  isSetupComplete: () => ipcRenderer.invoke('auth-is-setup-complete'),
  createAdmin: (username, password) => ipcRenderer.invoke('auth-create-admin', username, password),
  login: (username, password) => ipcRenderer.invoke('auth-login', username, password),
  logout: () => ipcRenderer.invoke('auth-logout'),
  isLoggedIn: () => ipcRenderer.invoke('auth-is-logged-in'),
  getSession: () => ipcRenderer.invoke('auth-get-session'),
  updateActivity: () => ipcRenderer.invoke('auth-update-activity'),
  getAdminInfo: () => ipcRenderer.invoke('auth-get-admin-info'),
  changePassword: (currentPassword, newPassword) => ipcRenderer.invoke('auth-change-password', currentPassword, newPassword),
  resetSetup: () => ipcRenderer.invoke('auth-reset-setup'),
  
  readFileAsBuffer: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result;
        const buffer = new Uint8Array(arrayBuffer);
        resolve(buffer);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  },
  
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', callback);
  },
  
  removeMenuActionListener: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
  
  onAudioNotification: (callback) => {
    ipcRenderer.on('audio-notification', callback);
  },
  
  removeAudioNotificationListener: () => {
    ipcRenderer.removeAllListeners('audio-notification');
  },

  onScheduledAudio: (callback) => {
    ipcRenderer.on('scheduled-audio', callback);
  },
  
  removeScheduledAudioListener: () => {
    ipcRenderer.removeAllListeners('scheduled-audio');
  },
  
  // Session management
  onSessionExpired: (callback) => {
    ipcRenderer.on('session-expired', callback);
  },
  
  removeSessionExpiredListener: () => {
    ipcRenderer.removeAllListeners('session-expired');
  },
  
  platform: process.platform,
  isDevelopment: () => ipcRenderer.invoke('is-development-mode'),
  restartApp: () => ipcRenderer.invoke('updater-restart-app'),
  
  handleError: (error, context = 'Unknown') => {
    return {
      message: error.message || 'Unknown error occurred',
      stack: error.stack,
      context: context,
      timestamp: new Date().toISOString()
    };
  }
});

// Note: Scheduled audio listener is set up in DOMContentLoaded with delay

window.addEventListener('DOMContentLoaded', () => {
  if (window.electronAPI && window.electronAPI.onAudioNotification) {
    window.electronAPI.onAudioNotification((event, notification) => {
      if (window.app && window.app.showNotification) {
        window.app.showNotification(notification.message, notification.type);
      }
    });
  }

  if (window.electronAPI && window.electronAPI.onSessionExpired) {
    window.electronAPI.onSessionExpired((event) => {
      if (window.app && window.app.handleSessionExpired) {
        window.app.handleSessionExpired();
      }
    });
  }

  // Note: Scheduled audio listener is now set up in app.js after full initialization

});

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  if (window.app && window.app.showNotification) {
    window.app.showNotification('An unexpected error occurred', 'error');
  }
});

window.addEventListener('error', (event) => {
  if (window.app && window.app.showNotification) {
    window.app.showNotification('An unexpected error occurred', 'error');
  }
});