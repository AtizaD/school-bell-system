/**
 * Templates Management for School Bell System
 * Complete template creation, management, and application system
 */

// Extend the main app with template methods
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.app) {
        extendAppWithTemplateMethods(window.app);
      }
    }, 100);
  });
}

function extendAppWithTemplateMethods(app) {

  /**
   * Update templates view
   */
  app.updateTemplates = async function() {
    try {
      await this.loadData();
      this.renderTemplates();
    } catch (error) {
      console.error('Templates update failed:', error);
      this.showNotification('Failed to update templates', 'error');
    }
  };

  /**
   * Render templates grid
   */
  app.renderTemplates = function() {
    const templatesGrid = document.getElementById('templatesGrid');
    if (!templatesGrid) return;

    const templates = this.data?.templates || [];

    if (templates.length === 0) {
      templatesGrid.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📋</span>
          <p>No templates created yet</p>
          <p>Templates let you save common schedule patterns and reuse them across different days</p>
          <div class="empty-actions">
            <button class="btn btn-primary" onclick="app.showCreateTemplateModal()">
              ➕ Create Template
            </button>
            <button class="btn btn-outline" onclick="app.showImportTemplateModal()">
              📁 Import Template
            </button>
          </div>
        </div>
      `;
      return;
    }

    const templatesHTML = templates.map(template => {
      const eventCount = template.events?.length || 0;
      const lastUsed = template.lastUsed ? new Date(template.lastUsed).toLocaleDateString() : 'Never';
      
      return `
        <div class="template-card" data-id="${template.id}">
          <div class="template-header">
            <div class="template-info">
              <div class="template-name">${this.escapeHtml(template.name)}</div>
              <div class="template-description">${this.escapeHtml(template.description || '')}</div>
            </div>
            <div class="template-badge">${eventCount} events</div>
          </div>
          
          <div class="template-body">
            <div class="template-stats">
              <div class="stat-item">
                <span class="stat-label">Created:</span>
                <span class="stat-value">${new Date(template.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Last Used:</span>
                <span class="stat-value">${lastUsed}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Uses:</span>
                <span class="stat-value">${template.useCount || 0}</span>
              </div>
            </div>
            
            ${eventCount > 0 ? `
              <div class="template-preview">
                <div class="preview-header">Schedule Preview:</div>
                <div class="preview-events">
                  ${template.events.slice(0, 3).map(event => `
                    <div class="preview-event">
                      <span class="preview-time">${event.time}</span>
                      <span class="preview-name">${this.escapeHtml(event.name)}</span>
                    </div>
                  `).join('')}
                  ${eventCount > 3 ? `
                    <div class="preview-more">+${eventCount - 3} more events</div>
                  ` : ''}
                </div>
              </div>
            ` : `
              <div class="template-empty">
                <span class="empty-text">No events in this template</span>
              </div>
            `}
          </div>
          
          <div class="template-actions">
            <button class="btn btn-sm btn-primary" 
                    onclick="app.showApplyTemplateModal('${template.id}')" 
                    title="Apply to schedule">
              📋 Apply
            </button>
            <button class="btn btn-sm btn-outline" 
                    onclick="app.previewTemplate('${template.id}')" 
                    title="Preview template">
              👁️ Preview
            </button>
            <button class="btn btn-sm btn-secondary" 
                    onclick="app.duplicateTemplate('${template.id}')" 
                    title="Duplicate template">
              📄 Duplicate
            </button>
            <button class="btn btn-sm btn-warning" 
                    onclick="app.exportTemplate('${template.id}')" 
                    title="Export template">
              💾 Export
            </button>
            <button class="btn btn-sm btn-danger" 
                    onclick="app.deleteTemplate('${template.id}')" 
                    title="Delete template">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    templatesGrid.innerHTML = templatesHTML;
  };

  /**
   * Show create template modal
   */
  app.showCreateTemplateModal = function() {
    const schedules = this.data?.schedules || {};
    const dayOptions = Object.keys(schedules)
      .filter(day => schedules[day].length > 0)
      .map(day => `
        <option value="${day}">${this.capitalizeFirst(day)} (${schedules[day].length} events)</option>
      `).join('');

    if (!dayOptions) {
      this.showNotification('No schedules available to create templates from. Create some events first!', 'warning');
      return;
    }

    const modalContent = `
      <div class="template-form-container">
        <form id="templateForm" class="template-form">
          
          <!-- Template Info -->
          <div class="form-group">
            <label for="templateName">Template Name *</label>
            <input type="text" id="templateName" placeholder="e.g., Standard School Day" required>
            <div class="form-help">Give your template a descriptive name</div>
          </div>
          
          <div class="form-group">
            <label for="templateDescription">Description</label>
            <textarea id="templateDescription" rows="3" placeholder="Describe when and how to use this template..."></textarea>
            <div class="form-help">Optional description to help identify this template</div>
          </div>
          
          <!-- Source Selection -->
          <div class="form-group">
            <label for="sourceDay">Create from existing schedule *</label>
            <select id="sourceDay" required>
              <option value="">Select a day to copy from...</option>
              ${dayOptions}
            </select>
            <div class="form-help">Choose which day's schedule to use as the template base</div>
          </div>
          
          <!-- Preview Section -->
          <div class="form-group" id="previewSection" style="display: none;">
            <label>Select events to include:</label>
            <div class="events-preview" id="eventsPreview">
              <!-- Dynamic content -->
            </div>
            <div class="form-help">Choose which events to include in your template</div>
          </div>
          
        </form>
      </div>
    `;

    const buttons = [
      { text: 'Cancel', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      { text: 'Create Template', class: 'btn btn-primary', onclick: () => this.createTemplate() }
    ];

    this.showModal('Create Schedule Template', modalContent, buttons);
    
    setTimeout(() => this.initCreateTemplateForm(), 100);
  };

  /**
   * Initialize create template form
   */
  app.initCreateTemplateForm = function() {
    const sourceDay = document.getElementById('sourceDay');
    const previewSection = document.getElementById('previewSection');
    const eventsPreview = document.getElementById('eventsPreview');

    sourceDay.addEventListener('change', () => {
      const selectedDay = sourceDay.value;
      if (selectedDay) {
        const daySchedule = this.data.schedules[selectedDay] || [];
        
        previewSection.style.display = 'block';
        
        const eventsHTML = daySchedule.map(event => `
          <div class="event-preview-item">
            <label class="event-checkbox">
              <input type="checkbox" value="${event.id}" checked>
              <div class="event-preview-info">
                <div class="event-preview-time">${event.time}</div>
                <div class="event-preview-name">${this.escapeHtml(event.name)}</div>
                <div class="event-preview-details">
                  ${event.audioSequence?.length || 0} audio file(s)
                  ${event.enabled === false ? ' • Disabled' : ' • Enabled'}
                  ${event.notes ? ` • ${this.escapeHtml(event.notes)}` : ''}
                </div>
              </div>
            </label>
          </div>
        `).join('');
        
        eventsPreview.innerHTML = eventsHTML || '<div class="no-events">No events found</div>';
      } else {
        previewSection.style.display = 'none';
      }
    });
  };

  /**
   * Create template
   */
  app.createTemplate = async function() {
    try {
      const name = document.getElementById('templateName').value.trim();
      const description = document.getElementById('templateDescription').value.trim();
      const sourceDay = document.getElementById('sourceDay').value;

      if (!name) {
        this.showNotification('Template name is required', 'error');
        document.getElementById('templateName').focus();
        return;
      }

      if (!sourceDay) {
        this.showNotification('Please select a source day', 'error');
        return;
      }

      // Get selected events
      const checkboxes = document.querySelectorAll('#eventsPreview input[type="checkbox"]:checked');
      const selectedEventIds = Array.from(checkboxes).map(cb => cb.value);

      if (selectedEventIds.length === 0) {
        this.showNotification('Please select at least one event', 'error');
        return;
      }

      // Get source events
      const sourceEvents = this.data.schedules[sourceDay] || [];
      const selectedEvents = sourceEvents.filter(event => selectedEventIds.includes(event.id));

      // Create template data
      const templateData = {
        name,
        description,
        events: selectedEvents.map(event => {
          // Remove day-specific data but keep all event properties
          const templateEvent = { ...event };
          delete templateEvent.id; // Will get new IDs when applied
          return templateEvent;
        }),
        sourceDay,
        createdAt: new Date().toISOString(),
        useCount: 0
      };

      // Save template
      await window.electronAPI.addTemplate(templateData);
      
      this.closeModal();
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template "${name}" created successfully!`, 'success');
      
    } catch (error) {
      console.error('Failed to create template:', error);
      this.showNotification(`Failed to create template: ${error.message}`, 'error');
    }
  };

  /**
   * Show apply template modal
   */
  app.showApplyTemplateModal = async function(templateId = null) {
    try {
      const templates = this.data?.templates || [];
      
      if (templates.length === 0) {
        this.showNotification('No templates available', 'warning');
        return;
      }

      const selectedTemplate = templateId ? templates.find(t => t.id === templateId) : null;

      const templateOptions = templates.map(template => `
        <option value="${template.id}" ${template.id === templateId ? 'selected' : ''}>
          ${this.escapeHtml(template.name)} (${template.events?.length || 0} events)
        </option>
      `).join('');

      const modalContent = `
        <div class="apply-template-container">
          
          <!-- Template Selection -->
          <div class="form-group">
            <label for="templateSelect">Select Template</label>
            <select id="templateSelect">
              <option value="">Choose a template...</option>
              ${templateOptions}
            </select>
          </div>
          
          <!-- Template Preview -->
          <div class="template-preview-section" id="templatePreviewSection" style="display: none;">
            <div class="preview-header">Template Preview:</div>
            <div class="template-preview-content" id="templatePreviewContent">
              <!-- Dynamic content -->
            </div>
          </div>
          
          <!-- Day Selection -->
          <div class="form-group">
            <label>Apply to days:</label>
            <div class="day-selection">
              <label class="day-checkbox"><input type="checkbox" value="monday"> Monday</label>
              <label class="day-checkbox"><input type="checkbox" value="tuesday"> Tuesday</label>
              <label class="day-checkbox"><input type="checkbox" value="wednesday"> Wednesday</label>
              <label class="day-checkbox"><input type="checkbox" value="thursday"> Thursday</label>
              <label class="day-checkbox"><input type="checkbox" value="friday"> Friday</label>
              <label class="day-checkbox"><input type="checkbox" value="saturday"> Saturday</label>
              <label class="day-checkbox"><input type="checkbox" value="sunday"> Sunday</label>
            </div>
            <div class="day-selection-helpers">
              <button type="button" class="btn btn-sm btn-outline" onclick="app.selectWeekdays()">Weekdays</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="app.selectWeekends()">Weekends</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="app.selectAllDays()">All Days</button>
              <button type="button" class="btn btn-sm btn-outline" onclick="app.clearDaySelection()">Clear</button>
            </div>
          </div>
          
          <!-- Options -->
          <div class="form-group">
            <div class="apply-options">
              <label class="option-checkbox">
                <input type="checkbox" id="replaceExisting" checked>
                Replace existing events on selected days
              </label>
              <label class="option-checkbox">
                <input type="checkbox" id="enableEvents" checked>
                Enable all events when applying
              </label>
            </div>
          </div>
          
          <!-- Warning -->
          <div class="apply-warning">
            <strong>⚠️ Warning:</strong> This will modify the selected day schedules. 
            If "Replace existing events" is checked, all current events on those days will be removed.
          </div>
          
        </div>
      `;

      const buttons = [
        { text: 'Cancel', class: 'btn btn-secondary', onclick: () => this.closeModal() },
        { text: 'Apply Template', class: 'btn btn-primary', onclick: () => this.applySelectedTemplate() }
      ];

      this.showModal('Apply Schedule Template', modalContent, buttons);
      
      setTimeout(() => {
        this.initApplyTemplateForm();
        if (selectedTemplate) {
          this.showTemplatePreview(selectedTemplate);
        }
      }, 100);
      
    } catch (error) {
      console.error('Failed to show apply template modal:', error);
      this.showNotification('Failed to load apply template form', 'error');
    }
  };

  /**
   * Initialize apply template form
   */
  app.initApplyTemplateForm = function() {
    const templateSelect = document.getElementById('templateSelect');
    
    templateSelect.addEventListener('change', () => {
      const templateId = templateSelect.value;
      if (templateId) {
        const template = this.data.templates.find(t => t.id === templateId);
        if (template) {
          this.showTemplatePreview(template);
        }
      } else {
        document.getElementById('templatePreviewSection').style.display = 'none';
      }
    });
  };

  /**
   * Show template preview
   */
  app.showTemplatePreview = function(template) {
    const previewSection = document.getElementById('templatePreviewSection');
    const previewContent = document.getElementById('templatePreviewContent');
    
    if (!template.events || template.events.length === 0) {
      previewContent.innerHTML = '<div class="no-events">This template has no events</div>';
    } else {
      const eventsHTML = template.events.map(event => `
        <div class="preview-event-item">
          <div class="preview-event-time">${event.time}</div>
          <div class="preview-event-name">${this.escapeHtml(event.name)}</div>
          <div class="preview-event-details">
            ${event.audioSequence?.length || 0} audio file(s)
            ${event.enabled === false ? ' • Will be disabled' : ' • Will be enabled'}
          </div>
        </div>
      `).join('');
      
      previewContent.innerHTML = eventsHTML;
    }
    
    previewSection.style.display = 'block';
  };

  /**
   * Day selection helpers
   */
  app.selectWeekdays = function() {
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    this.setDaySelection(weekdays);
  };

  app.selectWeekends = function() {
    const weekends = ['saturday', 'sunday'];
    this.setDaySelection(weekends);
  };

  app.selectAllDays = function() {
    const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    this.setDaySelection(allDays);
  };

  app.clearDaySelection = function() {
    this.setDaySelection([]);
  };

  app.setDaySelection = function(days) {
    const checkboxes = document.querySelectorAll('.day-checkbox input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = days.includes(checkbox.value);
    });
  };

  /**
   * Apply selected template
   */
  app.applySelectedTemplate = async function() {
    try {
      const templateId = document.getElementById('templateSelect').value;
      const replaceExisting = document.getElementById('replaceExisting').checked;
      const enableEvents = document.getElementById('enableEvents').checked;
      
      if (!templateId) {
        this.showNotification('Please select a template', 'error');
        return;
      }

      // Get selected days
      const selectedDays = Array.from(document.querySelectorAll('.day-checkbox input[type="checkbox"]:checked'))
        .map(cb => cb.value);

      if (selectedDays.length === 0) {
        this.showNotification('Please select at least one day', 'error');
        return;
      }

      const template = this.data.templates.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('Template not found', 'error');
        return;
      }

      // Confirm application
      const daysList = selectedDays.map(d => this.capitalizeFirst(d)).join(', ');
      const eventCount = template.events?.length || 0;
      
      const confirmMessage = `Apply "${template.name}" to ${daysList}?\n\n` +
        `This will ${replaceExisting ? 'replace all existing events' : 'add ' + eventCount + ' events'} ` +
        `on the selected days.\n\n` +
        `This action cannot be undone.`;

      if (!confirm(confirmMessage)) return;

      this.showLoading(true);
      let successCount = 0;

      for (const day of selectedDays) {
        try {
          // Clear existing events if requested
          if (replaceExisting) {
            const currentEvents = this.data.schedules[day] || [];
            for (const event of currentEvents) {
              await window.electronAPI.deleteScheduleEvent(day, event.id);
            }
          }

          // Add template events
          if (template.events) {
            for (const templateEvent of template.events) {
              const newEvent = {
                ...templateEvent,
                enabled: enableEvents ? true : (templateEvent.enabled !== false)
              };
              delete newEvent.id; // Remove ID so new one is generated
              
              await window.electronAPI.addScheduleEvent(day, newEvent);
            }
          }

          successCount++;
        } catch (error) {
          console.error(`Failed to apply template to ${day}:`, error);
          this.showNotification(`Failed to apply template to ${day}: ${error.message}`, 'error');
        }
      }

      this.closeModal();
      this.showLoading(false);

      // Refresh data and UI
      await this.loadData();
      this.updateSchedule();
      this.updateTemplates();

      if (successCount === selectedDays.length) {
        this.showNotification(`Template "${template.name}" applied successfully to ${successCount} day(s)!`, 'success');
      } else {
        this.showNotification(`Template applied to ${successCount} of ${selectedDays.length} days`, 'warning');
      }
      
    } catch (error) {
      console.error('Failed to apply template:', error);
      this.showLoading(false);
      this.showNotification(`Failed to apply template: ${error.message}`, 'error');
    }
  };

  /**
   * Preview template in modal
   */
  app.previewTemplate = function(templateId) {
    const template = this.data?.templates?.find(t => t.id === templateId);
    if (!template) {
      this.showNotification('Template not found', 'error');
      return;
    }

    const eventCount = template.events?.length || 0;
    const eventsHTML = eventCount > 0 ? template.events.map(event => `
      <div class="preview-detail-item">
        <div class="preview-detail-time">${event.time}</div>
        <div class="preview-detail-content">
          <div class="preview-detail-name">${this.escapeHtml(event.name)}</div>
          <div class="preview-detail-info">
            ${event.audioSequence?.length || 0} audio file(s)
            ${event.enabled === false ? ' • Disabled' : ' • Enabled'}
            ${event.notes ? ` • ${this.escapeHtml(event.notes)}` : ''}
          </div>
          ${event.audioSequence?.length ? `
            <div class="preview-audio-list">
              ${event.audioSequence.map(audio => `
                <span class="audio-chip">${this.escapeHtml(audio.audioFile)}${audio.repeat > 1 ? ` ×${audio.repeat}` : ''}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('') : '<div class="no-events">No events in this template</div>';

    const modalContent = `
      <div class="template-preview-modal">
        
        <div class="preview-header-section">
          <h4>${this.escapeHtml(template.name)}</h4>
          ${template.description ? `<p class="preview-description">${this.escapeHtml(template.description)}</p>` : ''}
        </div>
        
        <div class="preview-stats-section">
          <div class="preview-stat">
            <span class="stat-label">Events:</span>
            <span class="stat-value">${eventCount}</span>
          </div>
          <div class="preview-stat">
            <span class="stat-label">Created:</span>
            <span class="stat-value">${new Date(template.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="preview-stat">
            <span class="stat-label">Used:</span>
            <span class="stat-value">${template.useCount || 0} times</span>
          </div>
          ${template.lastUsed ? `
            <div class="preview-stat">
              <span class="stat-label">Last Used:</span>
              <span class="stat-value">${new Date(template.lastUsed).toLocaleDateString()}</span>
            </div>
          ` : ''}
        </div>
        
        <div class="preview-events-section">
          <h5>Schedule Events:</h5>
          <div class="preview-events-list">
            ${eventsHTML}
          </div>
        </div>
        
      </div>
    `;

    const buttons = [
      { text: 'Close', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      { text: 'Apply Template', class: 'btn btn-primary', onclick: () => { this.closeModal(); this.showApplyTemplateModal(templateId); } }
    ];

    this.showModal(`Template Preview - ${template.name}`, modalContent, buttons);
  };

  /**
   * Duplicate template
   */
  app.duplicateTemplate = async function(templateId) {
    try {
      const template = this.data?.templates?.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('Template not found', 'error');
        return;
      }

      const duplicateData = {
        name: `${template.name} (Copy)`,
        description: template.description,
        events: template.events ? [...template.events] : [],
        sourceDay: template.sourceDay,
        createdAt: new Date().toISOString(),
        useCount: 0
      };

      await window.electronAPI.addTemplate(duplicateData);
      
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template duplicated as "${duplicateData.name}"`, 'success');
      
    } catch (error) {
      console.error('Failed to duplicate template:', error);
      this.showNotification('Failed to duplicate template', 'error');
    }
  };

  /**
   * Export template
   */
  app.exportTemplate = async function(templateId) {
    try {
      const template = this.data?.templates?.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('Template not found', 'error');
        return;
      }

      const exportData = {
        name: template.name,
        description: template.description,
        events: template.events,
        exportedAt: new Date().toISOString(),
        version: '1.0'
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `template-${template.name.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(link.href);
      
      this.showNotification(`Template "${template.name}" exported successfully`, 'success');
      
    } catch (error) {
      console.error('Export failed:', error);
      this.showNotification('Failed to export template', 'error');
    }
  };

  /**
   * Show import template modal
   */
  app.showImportTemplateModal = function() {
    const modalContent = `
      <div class="import-template-container">
        
        <div class="import-header">
          <h4>📁 Import Schedule Template</h4>
          <p>Import a previously exported template file</p>
        </div>
        
        <div class="import-area" id="importDragArea">
          <div class="import-icon">📋</div>
          <div class="import-text">Drop template file here or click to browse</div>
          <div class="import-subtext">JSON files only</div>
          <input type="file" id="templateFileInput" accept=".json" style="display: none;">
        </div>
        
        <div class="import-info">
          <strong>📋 Supported Files:</strong>
          <ul>
            <li>Exported template JSON files</li>
            <li>Templates from other School Bell System installations</li>
          </ul>
        </div>
        
      </div>
    `;

    const buttons = [
      { text: 'Cancel', class: 'btn btn-secondary', onclick: () => this.closeModal() },
      { text: '📁 Browse Files', class: 'btn btn-primary', onclick: () => document.getElementById('templateFileInput').click() }
    ];

    this.showModal('Import Template', modalContent, buttons);
    
    setTimeout(() => this.setupTemplateImport(), 100);
  };

  /**
   * Setup template import functionality
   */
  app.setupTemplateImport = function() {
    const dragArea = document.getElementById('importDragArea');
    const fileInput = document.getElementById('templateFileInput');
    
    if (!dragArea || !fileInput) return;

    dragArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleTemplateFile(e.target.files[0]));

    ['dragenter', 'dragover'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        dragArea.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        dragArea.classList.remove('drag-over');
      });
    });

    dragArea.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) this.handleTemplateFile(file);
    });
  };

  /**
   * Handle template file import
   */
  app.handleTemplateFile = async function(file) {
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      this.showNotification('Please select a JSON file', 'error');
      return;
    }

    try {
      const text = await this.readFileAsText(file);
      const templateData = JSON.parse(text);

      // Validate template data
      if (!templateData.name || !Array.isArray(templateData.events)) {
        throw new Error('Invalid template file format');
      }

      // Create template
      const newTemplate = {
        name: templateData.name,
        description: templateData.description || '',
        events: templateData.events,
        importedAt: new Date().toISOString(),
        useCount: 0
      };

      await window.electronAPI.addTemplate(newTemplate);
      
      this.closeModal();
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template "${templateData.name}" imported successfully!`, 'success');
      
    } catch (error) {
      console.error('Import failed:', error);
      this.showNotification(`Failed to import template: ${error.message}`, 'error');
    }
  };

  /**
   * Delete template with confirmation
   */
  app.deleteTemplate = async function(templateId) {
    try {
      const template = this.data?.templates?.find(t => t.id === templateId);
      if (!template) {
        this.showNotification('Template not found', 'error');
        return;
      }

      const confirmMessage = `Delete template "${template.name}"?\n\n` +
        `This template has been used ${template.useCount || 0} times.\n\n` +
        `This action cannot be undone.`;

      if (!confirm(confirmMessage)) return;

      await window.electronAPI.deleteTemplate(templateId);
      
      await this.loadData();
      this.updateTemplates();
      
      this.showNotification(`Template "${template.name}" deleted successfully`, 'success');
      
    } catch (error) {
      console.error('Failed to delete template:', error);
      this.showNotification(`Failed to delete template: ${error.message}`, 'error');
    }
  };

  /**
   * Utility functions
   */
  
  app.capitalizeFirst = function(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  app.readFileAsText = function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  };

}

// Enhanced template styling
document.addEventListener('DOMContentLoaded', () => {
  const templateStyles = document.createElement('style');
  templateStyles.textContent = `
    /* Template Cards */
    .template-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      transition: all 0.3s ease;
      border: 2px solid transparent;
      overflow: hidden;
    }
    
    .template-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      border-color: #667eea;
    }
    
    .template-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1.5rem;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-bottom: 1px solid #dee2e6;
    }
    
    .template-info {
      flex: 1;
    }
    
    .template-name {
      font-size: 1.2rem;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }
    
    .template-description {
      color: #6c757d;
      font-size: 0.9rem;
      font-style: italic;
    }
    
    .template-badge {
      background: #667eea;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    
    .template-body {
      padding: 1.5rem;
    }
    
    .template-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .stat-item {
      text-align: center;
      padding: 0.75rem;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #e9ecef;
    }
    
    .stat-label {
      display: block;
      color: #6c757d;
      font-size: 0.8rem;
      margin-bottom: 0.25rem;
    }
    
    .stat-value {
      display: block;
      color: #2c3e50;
      font-weight: 600;
      font-size: 0.9rem;
    }
    
    .template-preview {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 1rem;
      border: 1px solid #dee2e6;
    }
    
    .preview-header {
      font-weight: 600;
      color: #495057;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
    }
    
    .preview-events {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .preview-event {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      background: white;
      border-radius: 6px;
      border: 1px solid #e9ecef;
    }
    
    .preview-time {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #667eea;
      min-width: 60px;
      font-size: 0.9rem;
    }
    
    .preview-name {
      flex: 1;
      color: #495057;
      font-size: 0.9rem;
    }
    
    .preview-more {
      text-align: center;
      color: #6c757d;
      font-style: italic;
      padding: 0.5rem;
      font-size: 0.8rem;
    }
    
    .template-empty {
      text-align: center;
      color: #6c757d;
      font-style: italic;
      padding: 1rem;
    }
    
    .template-actions {
      display: flex;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      background: #f8f9fa;
      border-top: 1px solid #dee2e6;
      flex-wrap: wrap;
    }
    
    .template-actions .btn {
      flex: 1;
      min-width: 80px;
    }
    
    .empty-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-top: 1rem;
      flex-wrap: wrap;
    }
    
    /* Form Styles */
    .template-form-container,
    .apply-template-container,
    .import-template-container {
      max-width: 600px;
    }
    
    .template-form,
    .apply-template-container,
    .import-template-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    
    .events-preview {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      background: #f8f9fa;
    }
    
    .event-preview-item {
      padding: 0.75rem;
      border-bottom: 1px solid #e9ecef;
    }
    
    .event-preview-item:last-child {
      border-bottom: none;
    }
    
    .event-checkbox {
      display: flex !important;
      align-items: flex-start;
      gap: 0.75rem;
      cursor: pointer;
    }
    
    .event-checkbox input[type="checkbox"] {
      margin-top: 0.25rem;
    }
    
    .event-preview-info {
      flex: 1;
    }
    
    .event-preview-time {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 0.25rem;
    }
    
    .event-preview-name {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }
    
    .event-preview-details {
      font-size: 0.8rem;
      color: #6c757d;
    }
    
    .day-selection {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    
    .day-checkbox {
      display: flex !important;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: #f8f9fa;
      border-radius: 6px;
      border: 1px solid #dee2e6;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .day-checkbox:hover {
      background: #e9ecef;
      border-color: #667eea;
    }
    
    .day-checkbox input:checked {
      accent-color: #667eea;
    }
    
    .day-selection-helpers {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    
    .apply-options {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #dee2e6;
    }
    
    .option-checkbox {
      display: flex !important;
      align-items: center;
      gap: 0.5rem;
    }
    
    .apply-warning {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      color: #856404;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
      font-size: 0.9rem;
    }
    
    .template-preview-section {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 1rem;
    }
    
    .preview-event-item {
      display: flex;
      gap: 1rem;
      padding: 0.75rem;
      background: white;
      border-radius: 6px;
      margin-bottom: 0.5rem;
      border: 1px solid #e9ecef;
    }
    
    .preview-event-item:last-child {
      margin-bottom: 0;
    }
    
    .preview-event-time {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #667eea;
      min-width: 70px;
    }
    
    .preview-event-name {
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }
    
    .preview-event-details {
      font-size: 0.8rem;
      color: #6c757d;
    }
    
    /* Import Styles */
    .import-area {
      border: 3px dashed #dee2e6;
      border-radius: 12px;
      padding: 3rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      background: #f8f9fa;
    }
    
    .import-area:hover,
    .import-area.drag-over {
      border-color: #667eea;
      background: #f0f3ff;
    }
    
    .import-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      color: #6c757d;
    }
    
    .import-text {
      font-size: 1.1rem;
      font-weight: 600;
      color: #495057;
      margin-bottom: 0.5rem;
    }
    
    .import-subtext {
      color: #6c757d;
      font-size: 0.9rem;
    }
    
    .import-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 1rem;
      border: 1px solid #dee2e6;
    }
    
    .import-info ul {
      margin: 0.5rem 0 0 1rem;
      padding: 0;
    }
    
    .import-info li {
      margin-bottom: 0.25rem;
      color: #6c757d;
    }
    
    /* Preview Modal Styles */
    .template-preview-modal {
      max-width: 700px;
    }
    
    .preview-header-section {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e9ecef;
    }
    
    .preview-description {
      color: #6c757d;
      font-style: italic;
      margin-top: 0.5rem;
    }
    
    .preview-stats-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #dee2e6;
    }
    
    .preview-stat {
      text-align: center;
    }
    
    .preview-events-section h5 {
      color: #495057;
      margin-bottom: 1rem;
    }
    
    .preview-events-list {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .preview-detail-item {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: #f8f9fa;
      border-radius: 8px;
      margin-bottom: 0.75rem;
      border-left: 4px solid #667eea;
    }
    
    .preview-detail-time {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #667eea;
      min-width: 80px;
      font-size: 1.1rem;
    }
    
    .preview-detail-content {
      flex: 1;
    }
    
    .preview-detail-name {
      font-weight: 600;
      color: #2c3e50;
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }
    
    .preview-detail-info {
      color: #6c757d;
      font-size: 0.9rem;
      margin-bottom: 0.75rem;
    }
    
    .preview-audio-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    
    .audio-chip {
      background: #667eea;
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    
    .no-events {
      text-align: center;
      color: #6c757d;
      font-style: italic;
      padding: 2rem;
    }
    
    @media (max-width: 768px) {
      .template-actions {
        flex-direction: column;
      }
      
      .template-actions .btn {
        width: 100%;
      }
      
      .day-selection {
        grid-template-columns: 1fr;
      }
      
      .day-selection-helpers {
        justify-content: center;
      }
      
      .template-stats {
        grid-template-columns: 1fr;
      }
      
      .preview-stats-section {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .preview-detail-item {
        flex-direction: column;
        gap: 0.5rem;
      }
      
      .preview-detail-time {
        min-width: auto;
      }
      
      .empty-actions {
        flex-direction: column;
        align-items: center;
      }
    }
  `;
  document.head.appendChild(templateStyles);
});