class SchoolBellApp {
  constructor() {
    this.currentTab = 'dashboard';
    this.currentDay = null; // Will be set to current day when schedule is first loaded
    this.data = null;
    this.isLoading = false;
    this.audioStatusInterval = null;
    this.nextEventInterval = null;
    this.activityUpdateInterval = null;
    this.isAuthenticated = false;
    this.isSetupComplete = false;
    this.currentModalClosable = true; // Track if current modal can be closed
    
    this.elements = {
      navTabs: document.querySelectorAll('.nav-tab'),
      tabContents: document.querySelectorAll('.tab-content'),
      dayTabs: document.querySelectorAll('.day-tab'),
      currentTime: document.getElementById('currentTime'),
      statusIndicator: document.getElementById('statusIndicator'),
      loadingOverlay: document.getElementById('loadingOverlay'),
      modalOverlay: document.getElementById('modalOverlay'),
      modal: document.getElementById('modal'),
      modalTitle: document.getElementById('modalTitle'),
      modalBody: document.getElementById('modalBody'),
      modalFooter: document.getElementById('modalFooter'),
      modalClose: document.getElementById('modalClose'),
      modalCancel: document.getElementById('modalCancel'),
      modalConfirm: document.getElementById('modalConfirm'),
      nextEventHeader: document.getElementById('nextEventHeader'),
      nextEventInfo: document.getElementById('nextEventInfo'),
      logoutBtn: document.getElementById('logoutBtn')
    }
  
    
    this.init();
  }

  async init() {
    try {
      this.showLoading(true);
      this.setupEventListeners();
      this.updateTime();
      setInterval(() => this.updateTime(), 1000);
      
      // Check authentication status
      await this.checkAuthStatus();
      this.updateAuthenticationUI();
      
      if (this.isAuthenticated) {
        await this.loadData();
        this.switchTab('dashboard');
        this.updateDashboard();
        this.setStatus('ready', 'Ready');
        this.startAudioStatusMonitoring();
        this.startNextEventMonitoring();
        this.startActivityUpdates();
      } else {
        this.setStatus('ready', 'Ready');
        this.showAuthenticationModal();
      }
    } catch (error) {
      console.error('App initialization failed:', error);
      this.setStatus('error', 'Error');
      this.showNotification('Failed to initialize application', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  setupEventListeners() {
    this.elements.navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        this.switchTab(tabName);
      });
    });

    this.elements.dayTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const day = e.currentTarget.dataset.day;
        this.switchDay(day);
      });
    });

    // Modal event listeners - FIXED to prevent conflicts
    this.elements.modalClose.addEventListener('click', () => this.closeModal());
    this.elements.modalCancel.addEventListener('click', () => this.closeModal());
    
    // Note: Removed the conflicting modalOverlay click listener
    // The modal overlay click handling is now done in showModal() method

    this.setupButtonEventListeners();

    if (window.electronAPI) {
      window.electronAPI.onMenuAction((event, action) => {
        this.handleMenuAction(action);
      });
      
      window.electronAPI.onSessionExpired(() => {
        this.handleSessionExpired();
      });
    }

    document.addEventListener('keydown', (e) => {
      this.handleKeyboard(e);
    });
  }

  setupButtonEventListeners() {
    const buttons = [
      { id: 'addEventBtn', action: () => this.switchTab('schedule') },
      { id: 'addScheduleEventBtn', action: () => this.showAddEventModal() },
      { id: 'addFirstEventBtn', action: () => this.showAddEventModal() },
      { id: 'applyTemplateBtn', action: () => this.showApplyTemplateModal() },
      { id: 'uploadAudioBtn', action: () => this.showUploadAudioModal() },
      { id: 'uploadFirstAudioBtn', action: () => this.showUploadAudioModal() },
      { id: 'createTemplateBtn', action: () => this.showCreateTemplateModal() },
      { id: 'createFirstTemplateBtn', action: () => this.showCreateTemplateModal() },
      { id: 'clearLogsBtn', action: () => this.showClearLogsModal() },
      { id: 'exportLogsBtn', action: () => this.exportLogs() }
    ];

    buttons.forEach(({ id, action }) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('click', action);
      }
    });
  }

  async loadData() {
    try {
      this.data = await window.electronAPI.getData();
    } catch (error) {
      console.error('Failed to load data:', error);
      throw error;
    }
  }

  switchTab(tabName) {
    this.elements.navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    this.elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === tabName);
    });

    this.currentTab = tabName;

    const updateMethods = {
      'dashboard': () => this.updateDashboard(),
      'schedule': () => this.updateSchedule(),
      'audio': () => this.updateAudioLibrary(),
      'templates': () => this.updateTemplates(),
      'logs': () => this.updateLogs(),
      'settings': () => this.updateSettings()
    };

    const updateMethod = updateMethods[tabName];
    if (updateMethod) {
      updateMethod();
    }
  }

  switchDay(day) {
    this.elements.dayTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.day === day);
    });

    this.currentDay = day;
    this.updateScheduleDay();
  }

  updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    if (this.elements.currentTime) {
      this.elements.currentTime.textContent = timeString;
    }
  }

  getCurrentDayName() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const today = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
    return days[today];
  }

  setStatus(type, message) {
    const statusElement = this.elements.statusIndicator;
    if (!statusElement) return;

    const dot = statusElement.querySelector('.status-dot');
    const text = statusElement.querySelector('.status-text');

    const colors = {
      'ready': '#00e676',
      'playing': '#2196f3',
      'error': '#f44336',
      'warning': '#ff9800'
    };

    dot.style.backgroundColor = colors[type] || '#9e9e9e';
    text.textContent = message;
  }

  showLoading(show) {
    this.isLoading = show;
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.toggle('active', show);
    }
  }

  // FIXED: Updated showModal to properly handle closable parameter
  showModal(title, content, buttons = null, closable = true) {
    if (!this.elements.modalOverlay) return;

    this.elements.modalTitle.textContent = title;
    this.elements.modalBody.innerHTML = content;

    // Show/hide close button based on closable parameter
    const closeButton = this.elements.modalClose;
    if (closeButton) {
      closeButton.style.display = closable ? 'flex' : 'none';
    }

    if (buttons) {
      this.elements.modalFooter.innerHTML = '';
      buttons.forEach(button => {
        const btn = document.createElement('button');
        btn.className = button.class || 'btn btn-secondary';
        btn.textContent = button.text;
        btn.onclick = button.onclick;
        this.elements.modalFooter.appendChild(btn);
      });
    } else {
      this.elements.modalFooter.innerHTML = `
        <button class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="app.closeModal()">OK</button>
      `;
    }

    this.elements.modalOverlay.classList.add('active');
    
    // Store closable state for use in closeModal
    this.currentModalClosable = closable;
    
    // Remove any existing click handler
    this.elements.modalOverlay.onclick = null;
    
    // Set up click outside to close only if closable
    if (closable) {
      this.elements.modalOverlay.onclick = (e) => {
        if (e.target === this.elements.modalOverlay) {
          this.closeModal();
        }
      };
    }
  }

  // FIXED: Updated closeModal to handle authentication state
  closeModal() {
    if (!this.elements.modalOverlay) return;
    
    // If this is an auth modal (not closable) and user is not authenticated,
    // prevent closing unless it's a legitimate action
    if (!this.currentModalClosable && !this.isAuthenticated) {
      console.log('Preventing unauthorized modal close');
      return;
    }
    
    this.elements.modalOverlay.classList.remove('active');
    this.elements.modalOverlay.onclick = null;
    this.currentModalClosable = true; // Reset for next modal
  }

  showNotification(message, type = 'info') {
    const typeMap = {
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'info': 'ℹ️'
    };
    
    console.log(`${typeMap[type]} ${message}`);
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${typeMap[type]}</span>
      <span class="toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  async updateDashboard() {
    try {
      await this.loadData();
      this.updateTodaySchedule();
      this.updateSystemStatus();
      this.updateNextEvent();
    } catch (error) {
      console.error('Dashboard update failed:', error);
      this.showNotification('Failed to update dashboard', 'error');
    }
  }

  updateTodaySchedule() {
    const today = new Date().getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayFull = dayNames[today];
    const todaySchedule = this.data?.schedules?.[todayFull] || [];
    
    const scheduleElement = document.getElementById('todaySchedule');
    const badgeElement = document.getElementById('todayBadge');
    
    if (!scheduleElement || !badgeElement) return;

    badgeElement.textContent = `${todaySchedule.length} events`;

    if (todaySchedule.length === 0) {
      scheduleElement.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📅</span>
          <p>No events scheduled for today</p>
        </div>
      `;
      return;
    }

    const scheduleHTML = todaySchedule.map(event => `
      <div class="schedule-preview-item">
        <div class="preview-time">${event.time}</div>
        <div class="preview-name">${this.escapeHtml(event.name)}</div>
        <div class="preview-status ${event.enabled ? 'enabled' : 'disabled'}">
          ${event.enabled ? '●' : '○'}
        </div>
      </div>
    `).join('');

    scheduleElement.innerHTML = scheduleHTML;
  }

  updateSystemStatus() {
    const templateCount = this.data?.templates?.length || 0;
    const totalEvents = Object.values(this.data?.schedules || {})
      .reduce((total, day) => total + day.length, 0);
    const systemVolume = this.data?.settings?.volume || 80;

    const updates = [
      { id: 'templateCount', value: templateCount },
      { id: 'totalEvents', value: totalEvents },
      { id: 'systemVolume', value: `${systemVolume}%` },
      { id: 'schedulerStatus', value: 'Active' }
    ];

    updates.forEach(({ id, value }) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  async updateNextEvent() {
    try {
      const nextEvents = await window.electronAPI.getNextEvents(1);
      const nextEventDisplay = document.getElementById('nextEventDisplay');
      const nextEventBadge = document.getElementById('nextEventBadge');
      
      if (!nextEventDisplay || !nextEventBadge) return;

      if (!nextEvents || nextEvents.length === 0) {
        nextEventDisplay.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">⏰</span>
            <p>No upcoming events scheduled</p>
          </div>
        `;
        nextEventBadge.textContent = 'None';
        this.updateNextEventHeader(null);
        return;
      }

      const nextEvent = nextEvents[0];
      const eventDate = new Date(nextEvent.date);
      const timeUntil = this.formatTimeUntil(nextEvent.timeUntil);
      
      nextEventDisplay.innerHTML = `
        <div class="next-event-item">
          <div class="next-event-header">
            <div class="next-event-name">${this.escapeHtml(nextEvent.name)}</div>
            <div class="next-event-time">${nextEvent.time}</div>
          </div>
          <div class="next-event-details">
            <div class="next-event-day">${this.capitalizeFirst(nextEvent.day)}</div>
            <div class="next-event-countdown">${timeUntil}</div>
          </div>
          <div class="next-event-date">${eventDate.toLocaleDateString()}</div>
        </div>
      `;
      
      nextEventBadge.textContent = timeUntil;
      this.updateNextEventHeader(nextEvent);
      
    } catch (error) {
      console.error('Failed to update next event:', error);
    }
  }

  updateNextEventHeader(nextEvent) {
    const nextEventInfo = this.elements.nextEventInfo;
    if (!nextEventInfo) return;

    if (!nextEvent) {
      nextEventInfo.textContent = 'No upcoming events';
      nextEventInfo.className = 'next-event-info no-events';
      return;
    }

    const timeUntil = this.formatTimeUntil(nextEvent.timeUntil);
    nextEventInfo.innerHTML = `
      <span class="next-event-name-header">${this.escapeHtml(nextEvent.name)}</span>
      <span class="next-event-time-header">${nextEvent.time}</span>
      <span class="next-event-countdown-header">${timeUntil}</span>
    `;
    nextEventInfo.className = 'next-event-info has-event';
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

  startNextEventMonitoring() {
    if (this.nextEventInterval) {
      clearInterval(this.nextEventInterval);
    }
    
    this.nextEventInterval = setInterval(async () => {
      if (this.currentTab === 'dashboard') {
        await this.updateNextEvent();
      } else {
        try {
          const nextEvents = await window.electronAPI.getNextEvents(1);
          this.updateNextEventHeader(nextEvents?.[0] || null);
        } catch (error) {
        }
      }
    }, 30000);
  }

  stopNextEventMonitoring() {
    if (this.nextEventInterval) {
      clearInterval(this.nextEventInterval);
      this.nextEventInterval = null;
    }
  }

  async updateSchedule() {
    try {
      await this.loadData();
      
      // If no current day is set, default to current day of the week
      if (!this.currentDay) {
        this.switchDay(this.getCurrentDayName());
      } else {
        // Make sure the correct day tab is highlighted
        this.elements.dayTabs.forEach(tab => {
          tab.classList.toggle('active', tab.dataset.day === this.currentDay);
        });
        this.updateScheduleDay();
      }
    } catch (error) {
      console.error('Schedule update failed:', error);
      this.showNotification('Failed to update schedule', 'error');
    }
  }

  updateScheduleDay() {
    const scheduleDay = document.getElementById('scheduleDay');
    if (!scheduleDay) return;

    const daySchedule = this.data?.schedules?.[this.currentDay] || [];

    if (daySchedule.length === 0) {
      scheduleDay.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📅</span>
          <p>No events scheduled for ${this.currentDay}</p>
          <button class="btn btn-outline" onclick="app.showAddEventModal()">Add First Event</button>
        </div>
      `;
      return;
    }

    const scheduleHTML = daySchedule.map(event => `
      <div class="schedule-event ${event.enabled ? '' : 'disabled'}" data-event-id="${event.id}">
        <div class="event-header">
          <div class="event-info">
            <div class="event-time">${event.time}</div>
            <div class="event-name">${this.escapeHtml(event.name)}</div>
            <div class="event-details">
              ${event.audioSequence?.length || 0} audio file(s)
              ${event.enabled ? '' : ' - <span class="disabled-text">Disabled</span>'}
            </div>
          </div>
          <div class="event-actions">
            <button class="btn btn-sm btn-success" onclick="app.testEvent('${event.id}')" title="Test Event">
              ▶️ Test
            </button>
            <button class="btn btn-sm btn-outline" onclick="app.editEvent('${event.id}')" title="Edit Event">
              ✏️ Edit
            </button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteEvent('${event.id}')" title="Delete Event">
              🗑️ Delete
            </button>
          </div>
        </div>
        ${event.audioSequence?.length ? `
          <div class="event-audio">
            <div class="audio-files">
              ${event.audioSequence.map(audio => `
                <span class="audio-tag">
                  🎵 ${this.escapeHtml(audio.audioFile)}
                  ${audio.repeat > 1 ? `<span class="audio-repeat">${audio.repeat}x</span>` : ''}
                </span>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="event-audio">
            <div class="no-audio-message">
              ⚠️ No audio files selected - this event will not play any sound
            </div>
          </div>
        `}
      </div>
    `).join('');

    scheduleDay.innerHTML = scheduleHTML;
  }

  async updateAudioLibrary() {
    try {
      await this.loadData();
      if (this.renderAudioFiles) {
        await this.renderAudioFiles();
      }
      if (this.setupAudioDragDrop) {
        this.setupAudioDragDrop();
      }
    } catch (error) {
      console.error('Audio library update failed:', error);
      this.showNotification('Failed to update audio library', 'error');
    }
  }

  async updateTemplates() {
    try {
      await this.loadData();
      this.renderTemplates();
    } catch (error) {
      console.error('Templates update failed:', error);
      this.showNotification('Failed to update templates', 'error');
    }
  }

  renderTemplates() {
    const templatesGrid = document.getElementById('templatesGrid');
    if (!templatesGrid) return;

    const templates = this.data?.templates || [];

    if (templates.length === 0) {
      templatesGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>No templates created yet</p>
          <button class="btn btn-outline" onclick="app.showCreateTemplateModal()">Create First Template</button>
        </div>
      `;
      return;
    }

    const templatesHTML = templates.map(template => `
      <div class="template-card" data-id="${template.id}">
        <div class="template-header">
          <div class="template-info">
            <div class="template-name">${this.escapeHtml(template.name)}</div>
            <div class="template-events">${template.events?.length || 0} events</div>
          </div>
          <div class="template-actions">
            <button class="btn btn-sm btn-outline" onclick="app.applyTemplate('${template.id}')" title="Apply">
              📋
            </button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteTemplate('${template.id}')" title="Delete">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `).join('');

    templatesGrid.innerHTML = templatesHTML;
  }

  async updateLogs() {
    try {
      const logs = await window.electronAPI.getLogs(100);
      this.renderLogs(logs);
    } catch (error) {
      console.error('Logs update failed:', error);
      this.showNotification('Failed to update logs', 'error');
    }
  }

  renderLogs(logs) {
    const logsList = document.getElementById('logsList');
    if (!logsList) return;

    if (logs.length === 0) {
      logsList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📝</span>
          <p>No activity logged yet</p>
        </div>
      `;
      return;
    }

    const logsHTML = logs.reverse().map(log => `
      <div class="log-item">
        <div class="log-content">
          <div class="log-type">${log.type.replace('_', ' ')}</div>
          <div class="log-message">${this.escapeHtml(log.message)}</div>
          ${log.details ? `<div class="log-details">${this.escapeHtml(log.details)}</div>` : ''}
        </div>
        <div class="log-time">${new Date(log.timestamp).toLocaleString()}</div>
      </div>
    `).join('');

    logsList.innerHTML = logsHTML;
  }

  async updateSettings() {
    try {
      await this.loadData();
      if (this.populateSettingsForm) {
        this.populateSettingsForm();
      }
      if (this.setupSettingsEventListeners) {
        this.setupSettingsEventListeners();
      }
    } catch (error) {
      console.error('Settings update failed:', error);
      this.showNotification('Failed to update settings', 'error');
    }
  }

  handleMenuAction(action) {
    const actions = {
      'new-event': () => {
        this.switchTab('schedule');
        this.showAddEventModal();
      },
      'upload-audio': () => {
        this.switchTab('audio');
        this.showUploadAudioModal();
      },
      'today-schedule': () => this.switchTab('dashboard'),
      'weekly-view': () => this.switchTab('schedule'),
      'audio-library': () => this.switchTab('audio')
    };

    const actionHandler = actions[action];
    if (actionHandler) {
      actionHandler();
    }
  }

  // FIXED: Updated handleKeyboard to respect auth modals
  handleKeyboard(e) {
    // If an auth modal is open (not closable), only allow escape if user is authenticated
    if (!this.currentModalClosable && !this.isAuthenticated && e.key === 'Escape') {
      e.preventDefault();
      return;
    }

    const shortcuts = [
      { keys: ['ctrlKey', 'n'], action: () => { this.switchTab('schedule'); this.showAddEventModal(); } },
      { keys: ['ctrlKey', 'u'], action: () => { this.switchTab('audio'); this.showUploadAudioModal(); } },
      { keys: ['ctrlKey', 't'], action: () => this.switchTab('dashboard') },
      { keys: ['ctrlKey', 'w'], action: () => this.switchTab('schedule') },
      { keys: ['ctrlKey', 'l'], action: () => this.switchTab('audio') }
    ];

    shortcuts.forEach(({ keys, action }) => {
      const isMatch = keys.every(key => {
        if (key === 'ctrlKey') return e.ctrlKey || e.metaKey;
        return e.key === key.replace('Key', '').toLowerCase();
      });

      if (isMatch) {
        e.preventDefault();
        action();
      }
    });

    if (e.key === 'Escape' && this.currentModalClosable) {
      this.closeModal();
    }
  }

  async testAudioFile(filename) {
    try {
      console.log('App.js: Testing audio file:', filename);
      this.showNotification(`Playing: ${filename}`, 'info');
      this.setStatus('playing', 'Playing Audio');
      
      if (this.setAudioControlsState) {
        this.setAudioControlsState(false);
      }
      
      // Use HTML5 audio player for consistent behavior
      let result;
      if (window.html5AudioPlayer) {
        try {
          result = await window.html5AudioPlayer.playAudio(filename);
          console.log('HTML5 audio playback started for:', filename);
          
          // Wait for audio to complete or be stopped
          await this.waitForAudioCompletion(filename);
        } catch (html5Error) {
          console.warn('HTML5 audio failed, falling back to main process:', html5Error.message);
          if (this.showNotification) {
            this.showNotification(`HTML5 audio failed, using system player...`, 'warning');
          }
          
          // Fallback to main process audio player
          result = await window.electronAPI.testAudio(filename);
        }
      } else {
        // Fallback to main process audio player
        result = await window.electronAPI.testAudio(filename);
      }
      
      this.setStatus('ready', 'Ready');
      
      if (this.setAudioControlsState) {
        this.setAudioControlsState(true);
      }
      
      if (result && result.success) {
        if (result.stopped) {
          this.showNotification(`Audio stopped: ${filename}`, 'info');
        } else {
          this.showNotification(`Audio completed: ${filename}`, 'success');
        }
      }
      
    } catch (error) {
      console.error('App.js: Audio test failed:', error);
      this.handleAudioError(error, 'audio test');
    }
  }

  waitForAudioCompletion(filename) {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        if (window.html5AudioPlayer && 
            (!window.html5AudioPlayer.isAudioPlaying() || 
             window.html5AudioPlayer.getCurrentFile() !== filename)) {
          resolve();
        } else {
          setTimeout(checkCompletion, 100);
        }
      };
      checkCompletion();
    });
  }

  async stopAllAudio() {
    try {
      // Stop HTML5 audio player first
      if (window.html5AudioPlayer && window.html5AudioPlayer.isAudioPlaying()) {
        await window.html5AudioPlayer.stopAudio();
        console.log('HTML5 audio stopped');
      }
      
      // Also stop main process audio for compatibility
      await window.electronAPI.stopAllAudio();
      this.setStatus('ready', 'Ready');
      
      if (this.setAudioControlsState) {
        this.setAudioControlsState(true);
      }
      
      this.showNotification('All audio stopped', 'info');
    } catch (error) {
      console.error('Failed to stop audio:', error);
      this.showNotification('Failed to stop audio', 'error');
    }
  }

  async testSystemAudio() {
    try {
      console.log('Testing system audio...');
      this.showNotification('Testing system audio (you should hear a beep)...', 'info');
      
      let result;
      // Use HTML5 audio player for system test if available
      if (window.html5AudioPlayer) {
        try {
          result = await window.html5AudioPlayer.testSystemAudio();
          console.log('HTML5 system audio test completed');
        } catch (error) {
          console.warn('HTML5 system audio test failed, trying fallback:', error.message);
          result = await window.electronAPI.testSystemAudio();
        }
      } else {
        result = await window.electronAPI.testSystemAudio();
      }
      
      if (result.success) {
        this.showNotification('System audio test completed! Did you hear a beep?', 'success');
      } else {
        this.showNotification('System audio test failed', 'error');
      }
      
    } catch (error) {
      console.error('System audio test failed:', error);
      this.showNotification('System audio test failed - check your audio drivers', 'error');
    }
  }

  setAudioControlsState(enabled) {
    const playButtons = document.querySelectorAll('.audio-controls .btn-success, .event-actions .btn-success');
    playButtons.forEach(button => {
      button.disabled = !enabled;
      if (enabled) {
        button.classList.remove('loading');
      } else {
        button.classList.add('loading');
      }
    });
  }

  handleAudioError(error, context = 'audio operation') {
    console.error(`Audio error in ${context}:`, error);
    
    this.setStatus('error', 'Audio Error');
    if (this.setAudioControlsState) {
      this.setAudioControlsState(true);
    }
    
    let userMessage = `${context} failed`;
    
    if (error.message) {
      if (error.message.includes('not found') || error.message.includes('ENOENT')) {
        userMessage += ' - Audio file not found';
      } else if (error.message.includes('permission') || error.message.includes('EACCES')) {
        userMessage += ' - Permission denied (check file permissions)';
      } else if (error.message.includes('format') || error.message.includes('codec')) {
        userMessage += ' - Unsupported audio format';
      } else if (error.message.includes('device') || error.message.includes('audio')) {
        userMessage += ' - Audio device issue (check speakers/headphones)';
      } else {
        userMessage += `: ${error.message}`;
      }
    }
    
    this.showNotification(userMessage, 'error');
    return userMessage;
  }

  async checkAudioSystemStatus() {
    try {
      const status = await window.electronAPI.getAudioStatus();
      
      if (status.isPlaying) {
        this.setStatus('playing', 'Audio Playing');
      } else if (status.isTesting) {
        this.setStatus('playing', 'Testing Audio');
      } else {
        this.setStatus('ready', 'Ready');
      }
      
      return status;
    } catch (error) {
      console.error('Failed to check audio status:', error);
      return null;
    }
  }

  startAudioStatusMonitoring() {
    if (this.audioStatusInterval) {
      clearInterval(this.audioStatusInterval);
    }
    
    this.audioStatusInterval = setInterval(async () => {
      await this.checkAudioSystemStatus();
    }, 2000);
  }

  stopAudioStatusMonitoring() {
    if (this.audioStatusInterval) {
      clearInterval(this.audioStatusInterval);
      this.audioStatusInterval = null;
    }
  }

  async testEvent(eventId) {
    try {
      const daySchedule = this.data?.schedules?.[this.currentDay] || [];
      const event = daySchedule.find(e => e.id === eventId);
      
      if (!event) {
        this.showNotification('Event not found', 'error');
        return;
      }

      if (!event.audioSequence || event.audioSequence.length === 0) {
        this.showNotification('This event has no audio sequence to test', 'warning');
        return;
      }

      this.showNotification(`Testing event: ${event.name}`, 'info');
      this.setStatus('playing', 'Testing Event');

      await window.electronAPI.testEvent(this.currentDay, event);
      
      this.setStatus('ready', 'Ready');
      this.showNotification(`Event test completed: ${event.name}`, 'success');
      
    } catch (error) {
      console.error('Failed to test event:', error);
      this.setStatus('error', 'Test Failed');
      this.showNotification(`Event test failed: ${error.message}`, 'error');
    }
  }

  async deleteEvent(eventId) {
    try {
      const daySchedule = this.data?.schedules?.[this.currentDay] || [];
      const event = daySchedule.find(e => e.id === eventId);
      
      if (!event) {
        this.showNotification('Event not found', 'error');
        return;
      }

      const confirmed = confirm(
        `Are you sure you want to delete "${event.name}"?\n\n` +
        `This will permanently remove the event scheduled for ${event.time} on ${this.currentDay}s.\n\n` +
        `This action cannot be undone.`
      );
      
      if (!confirmed) return;

      this.showNotification('Deleting event...', 'info');

      await window.electronAPI.deleteScheduleEvent(this.currentDay, eventId);
      
      await this.loadData();
      this.updateSchedule();
      
      this.showNotification(`Event "${event.name}" deleted successfully`, 'success');
      
    } catch (error) {
      console.error('Failed to delete event:', error);
      
      let errorMessage = 'Failed to delete event';
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      this.showNotification(errorMessage, 'error');
      
      try {
        await this.loadData();
        this.updateSchedule();
      } catch (reloadError) {
        console.error('Failed to reload data after delete error:', reloadError);
        this.showNotification('Please refresh the page to ensure data consistency', 'warning');
      }
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  showClearLogsModal() {
    const modalContent = `
      <div class="confirm-dialog">
        <p>Are you sure you want to clear all activity logs?</p>
        <p><strong>This action cannot be undone.</strong></p>
      </div>
    `;

    const buttons = [
      {
        text: 'Cancel',
        class: 'btn btn-secondary',
        onclick: () => this.closeModal()
      },
      {
        text: 'Clear Logs',
        class: 'btn btn-danger',
        onclick: () => this.confirmClearLogs()
      }
    ];

    this.showModal('Clear Activity Logs', modalContent, buttons);
  }

  async confirmClearLogs() {
    try {
      await window.electronAPI.clearLogs();
      this.closeModal();
      this.updateLogs();
      this.showNotification('Activity logs cleared successfully', 'success');
    } catch (error) {
      console.error('Failed to clear logs:', error);
      this.showNotification('Failed to clear logs', 'error');
    }
  }

  async exportLogs() {
    try {
      const result = await window.electronAPI.showSaveDialog({
        title: 'Export Activity Logs',
        defaultPath: `school-bell-logs-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePath) {
        const logs = await window.electronAPI.getLogs(1000);
        const logsData = JSON.stringify(logs, null, 2);
        this.showNotification('Logs export initiated', 'info');
      }
    } catch (error) {
      console.error('Failed to export logs:', error);
      this.showNotification('Failed to export logs', 'error');
    }
  }

  showCreateTemplateModal() {
    const modalContent = `
      <div class="empty-state">
        <span class="empty-icon">🚧</span>
        <p>Template creation feature coming soon</p>
        <p>This will allow you to save common schedule patterns for reuse.</p>
      </div>
    `;

    this.showModal('Create Template', modalContent);
  }

  applyTemplate(templateId) {
    this.showNotification('Apply template feature will be loaded by schedule.js', 'info');
  }

  async deleteTemplate(templateId) {
    try {
      const confirmed = confirm('Are you sure you want to delete this template?');
      if (!confirmed) return;

      await window.electronAPI.deleteTemplate(templateId);
      this.updateTemplates();
      this.showNotification('Template deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete template:', error);
      this.showNotification('Failed to delete template', 'error');
    }
  }

  cleanup() {
    this.stopAudioStatusMonitoring();
    this.stopNextEventMonitoring();
    this.stopActivityUpdates();
    if (window.electronAPI && window.electronAPI.removeMenuActionListener) {
      window.electronAPI.removeMenuActionListener();
    }
    if (window.electronAPI && window.electronAPI.removeAudioNotificationListener) {
      window.electronAPI.removeAudioNotificationListener();
    }
    if (window.electronAPI && window.electronAPI.removeSessionExpiredListener) {
      window.electronAPI.removeSessionExpiredListener();
    }
  }

  // AUTHENTICATION METHODS

  async checkAuthStatus() {
    try {
      this.isSetupComplete = await window.electronAPI.isSetupComplete();
      this.isAuthenticated = await window.electronAPI.isLoggedIn();
    } catch (error) {
      console.error('Failed to check auth status:', error);
      this.isSetupComplete = false;
      this.isAuthenticated = false;
    }
  }

  showAuthenticationModal() {
    if (!this.isSetupComplete) {
      this.showFirstTimeSetup();
    } else {
      this.showLoginModal();
    }
  }

  showFirstTimeSetup() {
    const modalContent = `
      <div class="first-time-setup">
        <div class="setup-header">
          <div class="setup-icon">🔔</div>
          <h3>Welcome to School Bell System</h3>
          <p>Let's set up your admin account to secure your bell system</p>
        </div>
        
        <form id="setupForm" class="setup-form">
          <div class="form-group">
            <label for="setupUsername">Username</label>
            <input type="text" id="setupUsername" placeholder="Enter admin username" required minlength="3" maxlength="20">
            <div class="form-help">3-20 characters, no spaces</div>
          </div>
          
          <div class="form-group">
            <label for="setupPassword">Password</label>
            <input type="password" id="setupPassword" placeholder="Enter password" required minlength="6">
            <div class="form-help">At least 6 characters with numbers</div>
          </div>
          
          <div class="form-group">
            <label for="setupConfirmPassword">Confirm Password</label>
            <input type="password" id="setupConfirmPassword" placeholder="Confirm password" required>
            <div class="form-help">Must match the password above</div>
          </div>
          
          <div class="security-info">
            <h4>🛡️ Security Features</h4>
            <ul>
              <li>Passwords are encrypted and secured</li>
              <li>Auto-logout after 15 minutes of inactivity</li>
              <li>Machine-bound authentication</li>
            </ul>
          </div>
        </form>
      </div>
    `;

    const buttons = [
      {
        text: 'Create Admin Account',
        class: 'btn btn-primary',
        onclick: () => this.completeFirstTimeSetup()
      }
    ];

    this.showModal('First Time Setup', modalContent, buttons, false);
    
    setTimeout(() => {
      document.getElementById('setupUsername').focus();
      this.setupFormValidation();
    }, 100);
  }

  setupFormValidation() {
    const form = document.getElementById('setupForm');
    const username = document.getElementById('setupUsername');
    const password = document.getElementById('setupPassword');
    const confirmPassword = document.getElementById('setupConfirmPassword');

    const validateForm = () => {
      const isValid = form.checkValidity() && 
                     password.value === confirmPassword.value &&
                     /\d/.test(password.value);
      
      const createBtn = document.querySelector('.btn-primary');
      if (createBtn) {
        createBtn.disabled = !isValid;
        createBtn.style.opacity = isValid ? '1' : '0.6';
      }
    };

    [username, password, confirmPassword].forEach(input => {
      input.addEventListener('input', validateForm);
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!document.querySelector('.btn-primary').disabled) {
            this.completeFirstTimeSetup();
          }
        }
      });
    });

    confirmPassword.addEventListener('input', () => {
      if (confirmPassword.value && password.value !== confirmPassword.value) {
        confirmPassword.setCustomValidity('Passwords do not match');
      } else {
        confirmPassword.setCustomValidity('');
      }
      validateForm();
    });

    validateForm();
  }

  // FIXED: Updated completeFirstTimeSetup to properly handle modal closing
  async completeFirstTimeSetup() {
    try {
      const username = document.getElementById('setupUsername').value.trim();
      const password = document.getElementById('setupPassword').value;
      const confirmPassword = document.getElementById('setupConfirmPassword').value;

      if (!username || !password) {
        this.showNotification('Please fill in all fields', 'error');
        return;
      }

      if (password !== confirmPassword) {
        this.showNotification('Passwords do not match', 'error');
        return;
      }

      if (!/\d/.test(password)) {
        this.showNotification('Password must contain at least one number', 'error');
        return;
      }

      this.showLoading(true);

      const result = await window.electronAPI.createAdmin(username, password);
      
      if (result.success) {
        // Auto-login after setup
        const loginResult = await window.electronAPI.login(username, password);
        
        if (loginResult.success) {
          this.isSetupComplete = true;
          this.isAuthenticated = true;
          this.updateAuthenticationUI();
          
          // Allow modal to close since setup was successful
          this.currentModalClosable = true;
          this.closeModal();
          
          this.showNotification('Setup completed successfully! Welcome to School Bell System.', 'success');
          
          // Initialize the app
          await this.loadData();
          this.switchTab('dashboard');
          this.updateDashboard();
          this.startAudioStatusMonitoring();
          this.startNextEventMonitoring();
          this.startActivityUpdates();
        }
      }

    } catch (error) {
      console.error('Setup failed:', error);
      this.showNotification(`Setup failed: ${error.message}`, 'error');
    } finally {
      this.showLoading(false);
    }
  }

  showLoginModal() {
    const modalContent = `
      <div class="login-modal">
        <div class="login-header">
          <div class="login-icon">🔐</div>
          <h3>School Bell System</h3>
          <p>Please sign in to continue</p>
        </div>
        
        <form id="loginForm" class="login-form">
          <div class="form-group">
            <label for="loginUsername">Username</label>
            <input type="text" id="loginUsername" placeholder="Enter username" required autocomplete="username">
          </div>
          
          <div class="form-group">
            <label for="loginPassword">Password</label>
            <input type="password" id="loginPassword" placeholder="Enter password" required autocomplete="current-password">
          </div>
          
          <div class="login-options">
            <label class="remember-me">
              <input type="checkbox" id="rememberMe">
              Remember me
            </label>
          </div>
        </form>
        
        <div class="login-info">
          <p>Session expires after 15 minutes of inactivity</p>
        </div>
      </div>
    `;

    const buttons = [
      {
        text: 'Sign In',
        class: 'btn btn-primary',
        onclick: () => this.performLogin()
      }
    ];

    this.showModal('Login Required', modalContent, buttons, false);
    
    setTimeout(() => {
      document.getElementById('loginUsername').focus();
      this.setupLoginFormHandlers();
    }, 100);
  }

  setupLoginFormHandlers() {
    const form = document.getElementById('loginForm');
    const username = document.getElementById('loginUsername');
    const password = document.getElementById('loginPassword');

    [username, password].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.performLogin();
        }
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.performLogin();
    });
  }

  // FIXED: Updated performLogin to properly handle modal closing
  async performLogin() {
    try {
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;

      if (!username || !password) {
        this.showNotification('Please enter both username and password', 'error');
        return;
      }

      this.showLoading(true);

      const result = await window.electronAPI.login(username, password);
      
      if (result.success) {
        this.isAuthenticated = true;
        this.updateAuthenticationUI();
        
        // Allow modal to close since login was successful
        this.currentModalClosable = true;
        this.closeModal();
        
        this.showNotification(`Welcome back, ${result.user.username}!`, 'success');
        
        // Initialize the app
        await this.loadData();
        this.switchTab('dashboard');
        this.updateDashboard();
        this.startAudioStatusMonitoring();
        this.startNextEventMonitoring();
        this.startActivityUpdates();
      }

    } catch (error) {
      console.error('Login failed:', error);
      this.showNotification(`Login failed: ${error.message}`, 'error');
      
      // Clear password field
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginPassword').focus();
    } finally {
      this.showLoading(false);
    }
  }

  async logout() {
    try {
      const result = await window.electronAPI.logout();
      
      if (result.success) {
        this.isAuthenticated = false;
        this.updateAuthenticationUI();
        this.stopAudioStatusMonitoring();
        this.stopNextEventMonitoring();
        this.stopActivityUpdates();
        
        // Clear sensitive data
        this.data = null;
        
        // Show login modal
        this.showAuthenticationModal();
        this.showNotification('Logged out successfully', 'info');
      }
    } catch (error) {
      console.error('Logout failed:', error);
      this.showNotification('Logout failed', 'error');
    }
  }

  startActivityUpdates() {
    // Update activity every 30 seconds to reset session timeout
    if (this.activityUpdateInterval) {
      clearInterval(this.activityUpdateInterval);
    }
    
    this.activityUpdateInterval = setInterval(async () => {
      if (this.isAuthenticated) {
        try {
          await window.electronAPI.updateActivity();
        } catch (error) {
          console.error('Failed to update activity:', error);
        }
      }
    }, 30000); // 30 seconds

    // Also update activity on user interactions
    ['click', 'keypress', 'mousemove', 'scroll'].forEach(eventType => {
      document.addEventListener(eventType, this.debounce(async () => {
        if (this.isAuthenticated) {
          try {
            await window.electronAPI.updateActivity();
          } catch (error) {
            // Silent fail
          }
        }
      }, 5000)); // Debounce to 5 seconds
    });
  }

  stopActivityUpdates() {
    if (this.activityUpdateInterval) {
      clearInterval(this.activityUpdateInterval);
      this.activityUpdateInterval = null;
    }
  }

  updateAuthenticationUI() {
    if (this.elements.logoutBtn) {
      this.elements.logoutBtn.style.display = this.isAuthenticated ? 'flex' : 'none';
    }
    
    // Blur the main content when not authenticated
    const appMain = document.querySelector('.app-main');
    if (appMain) {
      if (this.isAuthenticated) {
        appMain.style.filter = 'none';
        appMain.style.pointerEvents = 'auto';
      } else {
        appMain.style.filter = 'blur(2px)';
        appMain.style.pointerEvents = 'none';
      }
    }
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // FIXED: Updated handleSessionExpired to properly handle modal state
  handleSessionExpired() {
    this.isAuthenticated = false;
    this.updateAuthenticationUI();
    this.stopAudioStatusMonitoring();
    this.stopNextEventMonitoring();
    this.stopActivityUpdates();
    
    // Clear sensitive data
    this.data = null;
    
    // Close any existing modal first
    this.elements.modalOverlay.classList.remove('active');
    this.elements.modalOverlay.onclick = null;
    
    this.showNotification('Your session has expired. Please log in again.', 'warning');
    
    // Show auth modal after a brief delay
    setTimeout(() => {
      this.showAuthenticationModal();
    }, 500);
  }
}

const style = document.createElement('style');
style.textContent = `
  .toast {
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    z-index: 10000;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  
  .toast.show {
    transform: translateX(0);
  }
  
  .toast-success {
    background: rgba(40, 167, 69, 0.95);
  }
  
  .toast-error {
    background: rgba(220, 53, 69, 0.95);
  }
  
  .toast-warning {
    background: rgba(255, 193, 7, 0.95);
    color: #212529;
  }
  
  .toast-info {
    background: rgba(23, 162, 184, 0.95);
  }
  
  .toast-icon {
    font-size: 1.2rem;
  }
  
  .toast-message {
    flex: 1;
    font-weight: 500;
    line-height: 1.4;
  }
  
  .schedule-preview-item {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    border-bottom: 1px solid #e9ecef;
    gap: 1rem;
  }
  
  .schedule-preview-item:last-child {
    border-bottom: none;
  }
  
  .preview-time {
    font-weight: bold;
    color: #667eea;
    min-width: 60px;
    font-family: 'Courier New', monospace;
  }
  
  .preview-name {
    flex: 1;
    color: #495057;
  }
  
  .preview-status {
    font-size: 1.2rem;
  }
  
  .preview-status.enabled {
    color: #28a745;
  }
  
  .preview-status.disabled {
    color: #6c757d;
  }
  
  .disabled-text {
    color: #dc3545;
    font-weight: bold;
  }
  
  .no-audio-message {
    color: #ffc107;
    font-style: italic;
    padding: 0.5rem;
    background: rgba(255, 193, 7, 0.1);
    border-radius: 4px;
    border-left: 3px solid #ffc107;
  }
  
  .audio-controls .btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
    position: relative;
  }
  
  .audio-controls .btn.loading::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .next-event-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(255,255,255,0.1);
    border-radius: 20px;
    font-size: 0.9rem;
  }
  
  .next-event-label {
    font-weight: 500;
    opacity: 0.8;
  }
  
  .next-event-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .next-event-info.no-events {
    color: rgba(255,255,255,0.7);
    font-style: italic;
  }
  
  .next-event-info.has-event {
    color: white;
  }
  
  .next-event-name-header {
    font-weight: 600;
  }
  
  .next-event-time-header {
    font-family: 'Courier New', monospace;
    background: rgba(255,255,255,0.2);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }
  
  .next-event-countdown-header {
    background: #28a745;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  
  .next-event-item {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1.5rem;
    border-left: 4px solid #667eea;
  }
  
  .next-event-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }
  
  .next-event-name {
    font-size: 1.2rem;
    font-weight: 600;
    color: #2c3e50;
  }
  
  .next-event-time {
    font-family: 'Courier New', monospace;
    font-size: 1.1rem;
    font-weight: bold;
    color: #667eea;
  }
  
  .next-event-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .next-event-day {
    color: #6c757d;
    font-weight: 500;
  }
  
  .next-event-countdown {
    background: #28a745;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.9rem;
    font-weight: 600;
  }
  
  .next-event-date {
    color: #6c757d;
    font-size: 0.9rem;
    text-align: center;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  .confirm-dialog {
    text-align: center;
    padding: 1rem;
  }
  
  .confirm-dialog p {
    margin-bottom: 1rem;
    line-height: 1.5;
  }
  
  .confirm-dialog strong {
    color: #dc3545;
  }

  /* Auth Modal Styles */
  .first-time-setup, .login-modal {
    max-width: 500px;
    text-align: center;
  }

  .setup-header, .login-header {
    margin-bottom: 2rem;
  }

  .setup-icon, .login-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .setup-form, .login-form {
    text-align: left;
    margin: 2rem 0;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #495057;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e9ecef;
    border-radius: 8px;
    font-size: 0.9rem;
    transition: border-color 0.3s ease;
  }

  .form-group input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .form-help {
    font-size: 0.8rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .security-info {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1.5rem;
    border: 1px solid #e9ecef;
  }

  .security-info h4 {
    margin-bottom: 0.75rem;
    color: #495057;
  }

  .security-info ul {
    text-align: left;
    margin: 0;
    padding-left: 1.5rem;
  }

  .security-info li {
    margin-bottom: 0.5rem;
    color: #6c757d;
  }

  .login-options {
    margin: 1rem 0;
  }

  .remember-me {
    display: flex !important;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .login-info {
    background: #e3f2fd;
    border-radius: 8px;
    padding: 1rem;
    color: #1976d2;
    font-size: 0.9rem;
  }
  
  @media (max-width: 768px) {
    .next-event-header {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
    }
    
    .next-event-info {
      flex-direction: column;
      gap: 0.25rem;
      align-items: flex-start;
    }
    
    .next-event-header {
      flex-direction: column;
      gap: 0.5rem;
      align-items: stretch;
    }
    
    .next-event-details {
      flex-direction: column;
      gap: 0.5rem;
      align-items: stretch;
    }
  }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
  window.app = new SchoolBellApp();
  
  window.addEventListener('beforeunload', () => {
    if (window.app) {
      window.app.cleanup();
    }
  });
});

console.log('✅ Complete School Bell System app.js loaded');