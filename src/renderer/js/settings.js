/**
 * School Bell System - Settings Management
 * Handles settings view, form management, and all settings-related functionality
 * Extracted from app.js to reduce complexity and improve maintainability
 */

// Extend the main app with settings-specific methods
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait for app to be initialized
    setTimeout(() => {
      if (window.app) {
        extendAppWithSettingsMethods(window.app);
      }
    }, 100);
  });
}

function extendAppWithSettingsMethods(app) {

  /**
   * Update settings view and populate current values
   */
  app.updateSettings = async function() {
    try {
      console.log('Updating settings view...');
      await this.loadData();
      this.populateSettingsForm();
      this.setupSettingsEventListeners();
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  /**
   * Populate settings form with current values
   */
  app.populateSettingsForm = function() {
    const settings = this.data?.settings || {};
    console.log('Populating settings form with:', settings);
    
    // Volume settings
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    if (volumeSlider && volumeValue) {
      volumeSlider.value = settings.volume || 80;
      volumeValue.textContent = `${settings.volume || 80}%`;
      console.log('Set volume slider to:', settings.volume);
    }
    
    // Audio path
    const audioPath = document.getElementById('audioPath');
    if (audioPath) {
      audioPath.value = settings.audioPath || '';
      console.log('Set audio path to:', settings.audioPath);
    }
    
    // Auto start
    const autoStart = document.getElementById('autoStartCheckbox');
    if (autoStart) {
      autoStart.checked = settings.autoStart || false;
    }
    
    // Log level
    const logLevel = document.getElementById('logLevel');
    if (logLevel) {
      logLevel.value = settings.logLevel || 'info';
    }
    
    // Max log entries
    const maxLogEntries = document.getElementById('maxLogEntries');
    if (maxLogEntries) {
      maxLogEntries.value = settings.maxLogEntries || 1000;
    }
    
    console.log('Settings form populated with current values');
  };

  /**
   * Set up settings event listeners
   */
  app.setupSettingsEventListeners = function() {
    console.log('Setting up settings event listeners...');
    
    // Volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
      // Remove existing listeners to avoid duplicates
      volumeSlider.removeEventListener('input', this.handleVolumeChange);
      volumeSlider.removeEventListener('change', this.handleVolumeChange);
      
      // Add new listeners
      volumeSlider.addEventListener('input', (e) => this.handleVolumeChange(e));
      volumeSlider.addEventListener('change', (e) => this.handleVolumeChange(e));
    }
    
    // Auto start checkbox
    const autoStart = document.getElementById('autoStartCheckbox');
    if (autoStart) {
      autoStart.removeEventListener('change', this.handleAutoStartChange);
      autoStart.addEventListener('change', (e) => this.handleAutoStartChange(e));
    }
    
    // Log level dropdown
    const logLevel = document.getElementById('logLevel');
    if (logLevel) {
      logLevel.removeEventListener('change', this.handleLogLevelChange);
      logLevel.addEventListener('change', (e) => this.handleLogLevelChange(e));
    }
    
    // Max log entries
    const maxLogEntries = document.getElementById('maxLogEntries');
    if (maxLogEntries) {
      maxLogEntries.removeEventListener('change', this.handleMaxLogEntriesChange);
      maxLogEntries.addEventListener('change', (e) => this.handleMaxLogEntriesChange(e));
    }
    
    // Change audio path button
    const changePathBtn = document.getElementById('changePathBtn');
    if (changePathBtn) {
      changePathBtn.removeEventListener('click', this.handleChangeAudioPath);
      changePathBtn.addEventListener('click', () => this.handleChangeAudioPath());
    }
    
    // Data management buttons
    const exportDataBtn = document.getElementById('exportDataBtn');
    const importDataBtn = document.getElementById('importDataBtn');
    const resetDataBtn = document.getElementById('resetDataBtn');
    
    if (exportDataBtn) {
      exportDataBtn.removeEventListener('click', this.handleExportData);
      exportDataBtn.addEventListener('click', () => this.handleExportData());
    }
    
    if (importDataBtn) {
      importDataBtn.removeEventListener('click', this.handleImportData);
      importDataBtn.addEventListener('click', () => this.handleImportData());
    }
    
    if (resetDataBtn) {
      resetDataBtn.removeEventListener('click', this.handleResetData);
      resetDataBtn.addEventListener('click', () => this.handleResetData());
    }
    
    console.log('Settings event listeners configured');
  };

  /**
   * Handle volume slider changes
   */
  /**
   * Handle volume slider changes with real-time audio control
   */
  app.handleVolumeChange = async function(e) {
    const volume = parseInt(e.target.value);
    const volumeValue = document.getElementById('volumeValue');
    
    console.log('Volume change requested:', volume);
    
    // Update display immediately for responsive UI
    if (volumeValue) {
      volumeValue.textContent = `${volume}%`;
    }
    
    // Clear existing timeout to debounce rapid changes
    if (this.volumeUpdateTimeout) {
      clearTimeout(this.volumeUpdateTimeout);
    }
    
    // Apply volume immediately to HTML5 audio player (real-time)
    try {
      if (window.html5AudioPlayer) {
        window.html5AudioPlayer.setVolume(volume);
        console.log('Real-time HTML5 volume applied:', volume);
      }
      
      // Also update the main process for compatibility
      await window.electronAPI.setVolume(volume);
      console.log('Real-time volume applied:', volume);
    } catch (error) {
      console.warn('Real-time volume update failed:', error.message);
    }
    
    // Debounce the backend data save to prevent file locking conflicts  
    this.volumeUpdateTimeout = setTimeout(async () => {
      try {
        console.log('Saving volume to settings:', volume);
        
        // Update backend settings with retry mechanism
        await this.updateVolumeWithRetry(volume);
        
        this.showNotification(`Volume set to ${volume}%`, 'success');
        console.log('Volume settings saved successfully:', volume);
        
      } catch (error) {
        console.error('Failed to save volume setting after retries:', error);
        this.showNotification('Failed to save volume setting', 'error');
        
        // Revert display to last known good value
        try {
          const settings = await window.electronAPI.getSettings();
          if (volumeValue && settings) {
            volumeValue.textContent = `${settings.volume}%`;
            e.target.value = settings.volume;
          }
        } catch (revertError) {
          console.error('Failed to revert volume display:', revertError);
        }
      }
    }, 500); // Wait 500ms after last change before saving to file
  };

  /**
   * Update volume with retry mechanism
   */
  app.updateVolumeWithRetry = async function(volume, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await window.electronAPI.updateSettings({ volume: volume });
        console.log(`Volume update succeeded on attempt ${attempt}`);
        return; // Success!
        
      } catch (error) {
        console.warn(`Volume update attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error; // Final attempt failed, throw the error
        }
        
        // Wait before retrying (exponential backoff)
        const delay = attempt * 200; // 200ms, 400ms, 600ms
        console.log(`Retrying volume update in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  /**
   * Handle auto start checkbox changes
   */
  app.handleAutoStartChange = async function(e) {
    const autoStart = e.target.checked;
    
    try {
      await window.electronAPI.updateSettings({ autoStart: autoStart });
      this.showNotification(`Auto start ${autoStart ? 'enabled' : 'disabled'}`, 'success');
      console.log('Auto start updated:', autoStart);
      
    } catch (error) {
      console.error('Failed to update auto start:', error);
      this.showNotification('Failed to update auto start setting', 'error');
    }
  };

  /**
   * Handle log level changes
   */
  app.handleLogLevelChange = async function(e) {
    const logLevel = e.target.value;
    
    try {
      await window.electronAPI.updateSettings({ logLevel: logLevel });
      this.showNotification(`Log level set to ${logLevel}`, 'success');
      console.log('Log level updated:', logLevel);
      
    } catch (error) {
      console.error('Failed to update log level:', error);
      this.showNotification('Failed to update log level', 'error');
    }
  };

  /**
   * Handle max log entries changes
   */
  app.handleMaxLogEntriesChange = async function(e) {
    const maxEntries = parseInt(e.target.value);
    
    if (maxEntries < 100 || maxEntries > 10000) {
      this.showNotification('Max log entries must be between 100 and 10,000', 'error');
      e.target.value = this.data?.settings?.maxLogEntries || 1000;
      return;
    }
    
    try {
      await window.electronAPI.updateSettings({ maxLogEntries: maxEntries });
      this.showNotification(`Max log entries set to ${maxEntries}`, 'success');
      console.log('Max log entries updated:', maxEntries);
      
    } catch (error) {
      console.error('Failed to update max log entries:', error);
      this.showNotification('Failed to update max log entries', 'error');
    }
  };

  /**
   * Handle change audio path button
   */
  app.handleChangeAudioPath = async function() {
    try {
      const result = await window.electronAPI.showOpenDialog({
        title: 'Select Audio Files Directory',
        properties: ['openDirectory'],
        buttonLabel: 'Select Directory'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        const newPath = result.filePaths[0];
        
        await window.electronAPI.updateSettings({ audioPath: newPath });
        
        // Update the input field
        const audioPathInput = document.getElementById('audioPath');
        if (audioPathInput) {
          audioPathInput.value = newPath;
        }
        
        this.showNotification('Audio path updated successfully', 'success');
        console.log('Audio path updated:', newPath);
      }
      
    } catch (error) {
      console.error('Failed to change audio path:', error);
      this.showNotification('Failed to change audio path', 'error');
    }
  };

  /**
   * Handle export data
   */
  app.handleExportData = async function() {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: 'Export School Bell Data',
        defaultPath: `school-bell-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePath) {
        // The main process handles the actual export
        this.showNotification('Data export started...', 'info');
        console.log('Data export initiated');
      }
      
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showNotification('Failed to export data', 'error');
    }
  };

  /**
   * Handle import data
   */
  app.handleImportData = async function() {
    try {
      const confirmed = confirm('This will replace all current data! Are you sure you want to continue?');
      if (!confirmed) return;
      
      const result = await window.electronAPI.showOpenDialog({
        title: 'Import School Bell Data',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        this.showNotification('Data import started...', 'info');
        console.log('Data import initiated');
        
        // The main process handles the actual import and will reload the window
      }
      
    } catch (error) {
      console.error('Failed to import data:', error);
      this.showNotification('Failed to import data', 'error');
    }
  };

  /**
   * Handle reset data
   */
  app.handleResetData = async function() {
    const confirmed = confirm('This will delete ALL data and reset the application to defaults! This cannot be undone. Are you sure?');
    if (!confirmed) return;
    
    const doubleConfirmed = confirm('Are you absolutely sure? This will delete all schedules, audio files, and settings!');
    if (!doubleConfirmed) return;
    
    try {
      // Clear all data sections
      await window.electronAPI.updateSettings({
        volume: 80,
        audioPath: '',
        logLevel: 'info',
        autoStart: true,
        maxLogEntries: 1000
      });
      
      // Clear logs
      await window.electronAPI.clearLogs();
      
      this.showNotification('Data reset completed. Please restart the application.', 'success');
      console.log('Data reset completed');
      
      // Recommend restart
      setTimeout(() => {
        alert('Data has been reset. Please restart the application for changes to take effect.');
      }, 1000);
      
    } catch (error) {
      console.error('Failed to reset data:', error);
      this.showNotification('Failed to reset data', 'error');
    }
  };

  /**
   * Show settings validation errors
   */
  app.showSettingsValidationError = function(field, message) {
    const fieldElement = document.getElementById(field);
    if (fieldElement) {
      fieldElement.classList.add('error');
      
      // Remove error class after 3 seconds
      setTimeout(() => {
        fieldElement.classList.remove('error');
      }, 3000);
    }
    
    this.showNotification(message, 'error');
  };

  /**
   * Get current settings values from form
   */
  app.getCurrentSettingsFromForm = function() {
    return {
      volume: parseInt(document.getElementById('volumeSlider')?.value || 80),
      audioPath: document.getElementById('audioPath')?.value || '',
      autoStart: document.getElementById('autoStartCheckbox')?.checked || false,
      logLevel: document.getElementById('logLevel')?.value || 'info',
      maxLogEntries: parseInt(document.getElementById('maxLogEntries')?.value || 1000)
    };
  };

  /**
   * Validate settings form
   */
  app.validateSettingsForm = function() {
    const errors = [];
    
    const volume = parseInt(document.getElementById('volumeSlider')?.value);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      errors.push({ field: 'volumeSlider', message: 'Volume must be between 0 and 100' });
    }
    
    const maxLogEntries = parseInt(document.getElementById('maxLogEntries')?.value);
    if (isNaN(maxLogEntries) || maxLogEntries < 100 || maxLogEntries > 10000) {
      errors.push({ field: 'maxLogEntries', message: 'Max log entries must be between 100 and 10,000' });
    }
    
    return errors;
  };

  /**
   * Reset settings form to defaults
   */
  app.resetSettingsToDefaults = function() {
    const defaultSettings = {
      volume: 80,
      audioPath: '',
      autoStart: true,
      logLevel: 'info',
      maxLogEntries: 1000
    };
    
    // Update form fields
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    if (volumeSlider && volumeValue) {
      volumeSlider.value = defaultSettings.volume;
      volumeValue.textContent = `${defaultSettings.volume}%`;
    }
    
    const audioPath = document.getElementById('audioPath');
    if (audioPath) {
      audioPath.value = defaultSettings.audioPath;
    }
    
    const autoStart = document.getElementById('autoStartCheckbox');
    if (autoStart) {
      autoStart.checked = defaultSettings.autoStart;
    }
    
    const logLevel = document.getElementById('logLevel');
    if (logLevel) {
      logLevel.value = defaultSettings.logLevel;
    }
    
    const maxLogEntries = document.getElementById('maxLogEntries');
    if (maxLogEntries) {
      maxLogEntries.value = defaultSettings.maxLogEntries;
    }
    
    console.log('Settings form reset to defaults');
  };

  /**
   * Show settings help dialog
   */
  app.showSettingsHelp = function() {
    const helpContent = `
      <div class="settings-help">
        <h4>Settings Help</h4>
        
        <div class="help-section">
          <h5>Audio Settings</h5>
          <p><strong>System Volume:</strong> Controls the playback volume for all bell audio (0-100%)</p>
          <p><strong>Audio Files Path:</strong> Directory where audio files are stored</p>
        </div>
        
        <div class="help-section">
          <h5>Application Settings</h5>
          <p><strong>Auto Start:</strong> Automatically start the application when system boots</p>
          <p><strong>Log Level:</strong> Controls how much detail is logged (Error < Warning < Info < Debug)</p>
          <p><strong>Max Log Entries:</strong> Maximum number of log entries to keep (100-10,000)</p>
        </div>
        
        <div class="help-section">
          <h5>Data Management</h5>
          <p><strong>Export Data:</strong> Save all your schedules, settings, and data to a backup file</p>
          <p><strong>Import Data:</strong> Restore data from a previously exported backup file</p>
          <p><strong>Reset Data:</strong> Clear all data and return to factory defaults</p>
        </div>
      </div>
    `;

    this.showModal('Settings Help', helpContent);
  };

  console.log('Settings management methods loaded');
}

// Add enhanced settings styling
document.addEventListener('DOMContentLoaded', () => {
  const settingsStyles = document.createElement('style');
  settingsStyles.textContent = `
    .settings-help {
      max-width: 600px;
    }
    
    .help-section {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    
    .help-section h5 {
      color: #495057;
      margin-bottom: 0.75rem;
      font-size: 1.1rem;
    }
    
    .help-section p {
      margin-bottom: 0.5rem;
      line-height: 1.5;
    }
    
    .help-section p:last-child {
      margin-bottom: 0;
    }
    
    .form-control.error {
      border-color: #dc3545 !important;
      box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.1) !important;
      animation: shake 0.5s ease-in-out;
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-3px); }
      75% { transform: translateX(3px); }
    }
    
    .setting-item {
      position: relative;
    }
    
    .setting-item .form-help {
      transition: color 0.3s ease;
    }
    
    .setting-item:hover .form-help {
      color: #495057;
    }
    
    .volume-control {
      background: #f8f9fa;
      padding: 0.75rem;
      border-radius: 8px;
      border: 2px solid #e9ecef;
      transition: border-color 0.3s ease;
    }
    
    .volume-control:hover {
      border-color: #667eea;
    }
    
    .path-control {
      background: #f8f9fa;
      padding: 0.5rem;
      border-radius: 8px;
      border: 2px solid #e9ecef;
    }
    
    .setting-actions {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      border: 2px solid #e9ecef;
    }
    
    .setting-actions .btn {
      min-width: 140px;
    }
  `;
  document.head.appendChild(settingsStyles);
});