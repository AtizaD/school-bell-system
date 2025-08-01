/**
 * Schedule Management for School Bell System - CLEAN REWRITE
 * Simple, efficient schedule management with time picker and audio dropdown
 */

// Extend the main app with schedule methods
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.app) {
        extendAppWithScheduleMethods(window.app);
      }
    }, 100);
  });
}

function extendAppWithScheduleMethods(app) {

  /**
   * Show add event modal
   */
  app.showAddEventModal = async function() {
    try {
      // Get available audio files
      const audioFiles = await window.electronAPI.getAvailableAudioFiles();
      
      const modalContent = `
        <div class="event-form-container">
          <form id="eventForm" class="event-form">
            
            <!-- Event Name -->
            <div class="form-group">
              <label for="eventName">Event Name *</label>
              <input type="text" id="eventName" placeholder="e.g., Morning Bell" required>
            </div>
            
            <!-- Time Picker -->
            <div class="form-group">
              <label for="eventTime">Time *</label>
              <input type="time" id="eventTime" required>
            </div>
            
            <!-- Audio Selection -->
            <div class="form-group">
              <label>Audio Files</label>
              <div class="audio-section">
                <div class="audio-selector">
                  <select id="audioDropdown">
                    <option value="">Select an audio file...</option>
                    ${audioFiles.map(file => `<option value="${file}">${file}</option>`).join('')}
                  </select>
                  <button type="button" id="addAudioBtn" disabled>Add</button>
                </div>
                
                <!-- Selected Audio Display -->
                <div class="selected-audio" id="selectedAudio">
                  <div class="no-audio">No audio files selected</div>
                </div>
              </div>
            </div>
            
            <!-- Options -->
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="eventEnabled" checked>
                Enable this event
              </label>
            </div>
            
            <!-- Notes -->
            <div class="form-group">
              <label for="eventNotes">Notes (Optional)</label>
              <textarea id="eventNotes" rows="3" placeholder="Additional notes..."></textarea>
            </div>
            
          </form>
        </div>
      `;

      const buttons = [
        { text: 'Cancel', class: 'btn btn-secondary', onclick: () => this.closeModal() },
        { text: 'Test Event', class: 'btn btn-warning', onclick: () => this.testEvent() },
        { text: 'Save Event', class: 'btn btn-primary', onclick: () => this.saveEvent() }
      ];

      this.showModal('Add Schedule Event', modalContent, buttons);
      
      // Initialize form
      setTimeout(() => this.initEventForm(), 100);

    } catch (error) {
      console.error('Failed to show event modal:', error);
      this.showNotification('Failed to load event form', 'error');
    }
  };

  /**
   * Initialize event form
   */
  app.initEventForm = function() {
    this.audioSequence = [];
    
    const dropdown = document.getElementById('audioDropdown');
    const addBtn = document.getElementById('addAudioBtn');
    const eventNameInput = document.getElementById('eventName');
    
    // Focus the event name field for better UX
    if (eventNameInput) {
      eventNameInput.focus();
      eventNameInput.select(); // Select any existing text for easy replacement
    }
    
    // Enable/disable add button based on selection
    dropdown.addEventListener('change', () => {
      addBtn.disabled = !dropdown.value;
    });
    
    // Add audio to sequence
    addBtn.addEventListener('click', () => {
      this.addAudioToSequence();
    });
    
    console.log('Event form initialized');
  };

  /**
   * Add audio file to sequence
   */
  app.addAudioToSequence = function() {
    const dropdown = document.getElementById('audioDropdown');
    const selectedFile = dropdown.value;
    
    if (!selectedFile) return;
    
    // Check if already exists
    const existing = this.audioSequence.find(item => item.audioFile === selectedFile);
    
    if (existing) {
      existing.repeat++;
      this.showNotification(`Increased repeat count to ${existing.repeat}`, 'info');
    } else {
      this.audioSequence.push({
        audioFile: selectedFile,
        repeat: 1
      });
      this.showNotification(`Added ${selectedFile}`, 'success');
    }
    
    this.updateAudioDisplay();
    dropdown.value = '';
    document.getElementById('addAudioBtn').disabled = true;
  };

  /**
   * Update audio sequence display
   */
  app.updateAudioDisplay = function() {
    const container = document.getElementById('selectedAudio');
    
    if (this.audioSequence.length === 0) {
      container.innerHTML = '<div class="no-audio">No audio files selected</div>';
      return;
    }
    
    const html = this.audioSequence.map((item, index) => `
      <div class="audio-item">
        <div class="audio-info">
          <span class="audio-name">${item.audioFile}</span>
          <span class="audio-repeat">×${item.repeat}</span>
        </div>
        <div class="audio-controls">
          <button type="button" onclick="app.changeRepeat(${index}, -1)" title="Decrease">−</button>
          <button type="button" onclick="app.changeRepeat(${index}, 1)" title="Increase">+</button>
          <button type="button" onclick="app.previewAudio('${item.audioFile}')" title="Preview">▶</button>
          <button type="button" onclick="app.removeAudio(${index})" title="Remove">×</button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  };

  /**
   * Change repeat count
   */
  app.changeRepeat = function(index, delta) {
    const item = this.audioSequence[index];
    if (!item) return;
    
    item.repeat = Math.max(1, Math.min(10, item.repeat + delta));
    this.updateAudioDisplay();
  };

  /**
   * Remove audio from sequence
   */
  app.removeAudio = function(index) {
    if (this.audioSequence[index]) {
      this.audioSequence.splice(index, 1);
      this.updateAudioDisplay();
      this.showNotification('Audio file removed', 'info');
    }
  };

  /**
   * Preview audio file
   */
  app.previewAudio = function(filename) {
    this.testAudioFile(filename);
  };

  /**
   * Get form data
   */
  app.getEventData = function() {
    const name = document.getElementById('eventName').value.trim();
    const time = document.getElementById('eventTime').value;
    const enabled = document.getElementById('eventEnabled').checked;
    const notes = document.getElementById('eventNotes').value.trim();
    
    // Convert time to HH:MM:SS format
    const timeParts = time.split(':');
    const formattedTime = timeParts.length === 2 ? `${time}:00` : time;
    
    return {
      name,
      time: formattedTime,
      enabled,
      notes,
      audioSequence: [...this.audioSequence]
    };
  };

  /**
   * Validate event data
   */
  app.validateEvent = function(data) {
    if (!data.name) {
      this.showNotification('Event name is required', 'error');
      document.getElementById('eventName').focus();
      return false;
    }
    
    if (!data.time) {
      this.showNotification('Event time is required', 'error');
      document.getElementById('eventTime').focus();
      return false;
    }
    
    return true;
  };

  /**
   * Test event
   */
  app.testEvent = async function(eventId = null) {
    try {
      let eventData;
      let context;
      
      if (eventId) {
        // Testing an existing event from the schedule
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

        eventData = event;
        context = `Testing event: ${event.name}`;
      } else {
        // Testing event from form (during creation/editing)
        const data = this.getEventData();
        
        if (!this.validateEvent(data)) return;
        
        if (data.audioSequence.length === 0) {
          this.showNotification('Add at least one audio file to test', 'warning');
          return;
        }
        
        eventData = data;
        context = 'Testing event...';
      }
      
      this.showNotification(context, 'info');
      this.setStatus('playing', 'Testing Event');
      
      await window.electronAPI.testEvent(this.currentDay, eventData);
      
      this.setStatus('ready', 'Ready');
      this.showNotification('Test completed!', 'success');
      
    } catch (error) {
      console.error('Test failed:', error);
      this.setStatus('error', 'Test Failed');
      this.showNotification(`Test failed: ${error.message}`, 'error');
    }
  };

  /**
   * Save event
   */
  app.saveEvent = async function() {
    try {
      const data = this.getEventData();
      
      if (!this.validateEvent(data)) return;
      
      this.showLoading(true);
      
      if (this.editingEventId) {
        await window.electronAPI.updateScheduleEvent(this.currentDay, this.editingEventId, data);
        this.showNotification('Event updated successfully!', 'success');
      } else {
        await window.electronAPI.addScheduleEvent(this.currentDay, data);
        this.showNotification('Event saved successfully!', 'success');
      }
      
      this.closeModal();
      this.showLoading(false);
      
      // Refresh schedule
      await this.loadData();
      this.updateSchedule();
      
    } catch (error) {
      console.error('Save failed:', error);
      this.showLoading(false);
      this.showNotification(`Save failed: ${error.message}`, 'error');
    }
  };

  /**
   * Edit event
   */
  app.editEvent = async function(eventId) {
    try {
      const daySchedule = this.data?.schedules?.[this.currentDay] || [];
      const event = daySchedule.find(e => e.id === eventId);
      
      if (!event) {
        this.showNotification('Event not found', 'error');
        return;
      }
      
      // Show form
      await this.showAddEventModal();
      
      // Populate with event data
      setTimeout(() => {
        document.getElementById('modalTitle').textContent = 'Edit Event';
        const eventNameInput = document.getElementById('eventName');
        eventNameInput.value = event.name;
        document.getElementById('eventTime').value = event.time.substring(0, 5); // HH:MM:SS to HH:MM
        document.getElementById('eventEnabled').checked = event.enabled !== false;
        document.getElementById('eventNotes').value = event.notes || '';
        
        // Focus and select the event name for easy editing
        eventNameInput.focus();
        eventNameInput.select();
        
        // Set audio sequence
        this.audioSequence = event.audioSequence ? [...event.audioSequence] : [];
        this.updateAudioDisplay();
        
        // Update button
        const saveBtn = document.querySelector('.btn-primary');
        saveBtn.textContent = 'Update Event';
        
        this.editingEventId = eventId;
      }, 200);
      
    } catch (error) {
      console.error('Edit failed:', error);
      this.showNotification('Failed to load event', 'error');
    }
  };

  /**
   * Apply template modal
   */
  app.showApplyTemplateModal = async function() {
    try {
      const templates = await window.electronAPI.getTemplates();
      
      if (templates.length === 0) {
        this.showNotification('No templates available', 'warning');
        return;
      }
      
      const templatesList = templates.map(template => `
        <div class="template-option">
          <label>
            <input type="radio" name="template" value="${template.id}">
            <div class="template-info">
              <strong>${template.name}</strong>
              <span>${template.events?.length || 0} events</span>
            </div>
          </label>
        </div>
      `).join('');
      
      const content = `
        <div class="template-selector">
          <p><strong>Apply template to ${this.currentDay}:</strong></p>
          <div class="warning">⚠️ This will replace all existing events</div>
          <div class="templates-list">
            ${templatesList}
          </div>
        </div>
      `;
      
      const buttons = [
        { text: 'Cancel', class: 'btn btn-secondary', onclick: () => this.closeModal() },
        { text: 'Apply', class: 'btn btn-warning', onclick: () => this.applyTemplate() }
      ];
      
      this.showModal('Apply Template', content, buttons);
      
    } catch (error) {
      console.error('Template modal failed:', error);
      this.showNotification('Failed to load templates', 'error');
    }
  };

  /**
   * Apply selected template
   */
  app.applyTemplate = async function() {
    try {
      const selected = document.querySelector('input[name="template"]:checked');
      
      if (!selected) {
        this.showNotification('Please select a template', 'warning');
        return;
      }
      
      const templates = await window.electronAPI.getTemplates();
      const template = templates.find(t => t.id === selected.value);
      
      if (!template) {
        this.showNotification('Template not found', 'error');
        return;
      }
      
      const confirmed = confirm(`Apply "${template.name}" to ${this.currentDay}? This will replace all existing events.`);
      if (!confirmed) return;
      
      this.showLoading(true);
      
      // Clear existing events
      const currentEvents = this.data?.schedules?.[this.currentDay] || [];
      for (const event of currentEvents) {
        await window.electronAPI.deleteScheduleEvent(this.currentDay, event.id);
      }
      
      // Add template events
      if (template.events) {
        for (const event of template.events) {
          const newEvent = { ...event };
          delete newEvent.id; // Remove ID so new one is generated
          await window.electronAPI.addScheduleEvent(this.currentDay, newEvent);
        }
      }
      
      this.closeModal();
      this.showLoading(false);
      
      // Refresh
      await this.loadData();
      this.updateSchedule();
      
      this.showNotification(`Template "${template.name}" applied!`, 'success');
      
    } catch (error) {
      console.error('Apply template failed:', error);
      this.showLoading(false);
      this.showNotification('Failed to apply template', 'error');
    }
  };

  console.log('✅ Clean schedule management loaded');
}

// Clean, minimal CSS
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .event-form-container {
      max-width: 500px;
      margin: 0 auto;
    }
    
    .event-form {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .form-group label {
      font-weight: 600;
      color: #374151;
    }
    
    .form-group input,
    .form-group select,
    .form-group textarea {
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 0.9rem;
      transition: border-color 0.2s;
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }
    
    .audio-section {
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 1rem;
      background: #f9fafb;
    }
    
    .audio-selector {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .audio-selector select {
      flex: 1;
      margin: 0;
    }
    
    .audio-selector button {
      padding: 0.75rem 1rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    
    .audio-selector button:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    
    .audio-selector button:not(:disabled):hover {
      background: #2563eb;
    }
    
    .selected-audio {
      min-height: 60px;
      border: 2px dashed #d1d5db;
      border-radius: 6px;
      padding: 0.75rem;
    }
    
    .no-audio {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding: 1rem;
    }
    
    .audio-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background: white;
      border-radius: 6px;
      margin-bottom: 0.5rem;
      border: 1px solid #e5e7eb;
    }
    
    .audio-item:last-child {
      margin-bottom: 0;
    }
    
    .audio-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex: 1;
    }
    
    .audio-name {
      font-weight: 500;
      color: #374151;
    }
    
    .audio-repeat {
      font-size: 0.8rem;
      color: #6b7280;
    }
    
    .audio-controls {
      display: flex;
      gap: 0.25rem;
    }
    
    .audio-controls button {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }
    
    .audio-controls button:nth-child(1) { background: #ef4444; color: white; }
    .audio-controls button:nth-child(2) { background: #10b981; color: white; }
    .audio-controls button:nth-child(3) { background: #3b82f6; color: white; }
    .audio-controls button:nth-child(4) { background: #6b7280; color: white; }
    
    .audio-controls button:hover {
      transform: scale(1.1);
    }
    
    .checkbox-label {
      display: flex !important;
      flex-direction: row !important;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }
    
    .checkbox-label input {
      width: auto;
      margin: 0;
    }
    
    .template-selector {
      max-width: 400px;
    }
    
    .warning {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      color: #92400e;
      padding: 0.75rem;
      border-radius: 6px;
      margin: 1rem 0;
      text-align: center;
    }
    
    .templates-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
    }
    
    .template-option {
      padding: 1rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .template-option:last-child {
      border-bottom: none;
    }
    
    .template-option label {
      display: flex !important;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      margin: 0;
    }
    
    .template-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .template-info span {
      font-size: 0.8rem;
      color: #6b7280;
    }
    
    @media (max-width: 768px) {
      .audio-selector {
        flex-direction: column;
      }
      
      .audio-item {
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
      }
      
      .audio-controls {
        justify-content: center;
      }
    }
  `;
  document.head.appendChild(style);
});