if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (window.app) {
        extendAppWithAudioMethods(window.app);
      }
    }, 100);
  });
}

function extendAppWithAudioMethods(app) {

  app.updateAudioLibrary = async function() {
    try {
      this.showNotification('Loading audio library...', 'info');
      await this.loadData();
      await this.renderAudioFiles();
      this.setupAudioDragDrop();
    } catch (error) {
      this.showNotification('Failed to load audio library', 'error');
    }
  };

  app.renderAudioFiles = async function() {
    const audioGrid = document.getElementById('audioGrid');
    if (!audioGrid) return;

    const audioFiles = this.data?.audioFiles || [];
    
    try {
      const availableFiles = await window.electronAPI.getAvailableAudioFiles();
      
      if (audioFiles.length === 0) {
        audioGrid.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">🎵</span>
            <p>No audio files uploaded yet</p>
            <p>Upload audio files to use them in your bell schedules</p>
            <button class="btn btn-outline" onclick="app.showUploadAudioModal()">
              📁 Upload Audio Files
            </button>
          </div>
        `;
        return;
      }

      const audioHTML = audioFiles.map(audioFile => {
        const isAvailable = availableFiles.includes(audioFile.filename);
        const statusClass = isAvailable ? 'available' : 'missing';
        const statusText = isAvailable ? '✅ Available' : '❌ Missing';
        const statusIcon = isAvailable ? '✅' : '⚠️';
        
        return `
          <div class="audio-file ${statusClass}" data-id="${audioFile.id}" data-filename="${audioFile.filename}">
            <div class="audio-header">
              <div class="audio-info">
                <div class="audio-name">${this.escapeHtml(audioFile.name)}</div>
                <div class="audio-filename">${this.escapeHtml(audioFile.filename)}</div>
                <div class="audio-metadata">
                  <span class="audio-size">${this.formatFileSize(audioFile.size)}</span>
                  <span class="audio-type">${this.getFileTypeDisplay(audioFile.filename)}</span>
                  <span class="audio-uploaded">${this.formatUploadDate(audioFile.uploadedAt)}</span>
                </div>
              </div>
              <div class="audio-controls">
                <button class="btn btn-sm btn-success play-btn" 
                        onclick="app.testAudio('${audioFile.filename}')" 
                        title="Play this audio file"
                        ${!isAvailable ? 'disabled' : ''}>
                  ▶️ Play
                </button>
                <button class="btn btn-sm btn-secondary stop-btn" 
                        onclick="app.stopAudio()" 
                        title="Stop all audio">
                  ⏹️ Stop
                </button>
                <button class="btn btn-sm btn-info" 
                        onclick="app.showAudioDetails('${audioFile.id}')" 
                        title="View details">
                  ℹ️ Details
                </button>
                <button class="btn btn-sm btn-danger" 
                        onclick="app.deleteAudio('${audioFile.id}', '${this.escapeHtml(audioFile.name)}')" 
                        title="Delete this audio file">
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      audioGrid.innerHTML = audioHTML;
      
      // Log missing files to console but don't show user notification
      const totalFiles = audioFiles.length;
      const availableCount = audioFiles.filter(af => availableFiles.includes(af.filename)).length;
      const missingCount = totalFiles - availableCount;
      
      if (missingCount > 0) {
        console.warn(`${missingCount} of ${totalFiles} audio file(s) are missing from disk`);
      }
      
    } catch (error) {
      const audioHTML = audioFiles.map(audioFile => `
        <div class="audio-file unknown" data-id="${audioFile.id}" data-filename="${audioFile.filename}">
          <div class="audio-header">
            <div class="audio-info">
              <div class="audio-name">${this.escapeHtml(audioFile.name)}</div>
              <div class="audio-filename">${this.escapeHtml(audioFile.filename)}</div>
              <div class="audio-size">${this.formatFileSize(audioFile.size)}</div>
            </div>
            <div class="audio-controls">
              <button class="btn btn-sm btn-success play-btn" onclick="app.testAudio('${audioFile.filename}')">
                ▶️ Play
              </button>
              <button class="btn btn-sm btn-secondary stop-btn" onclick="app.stopAudio()">
                ⏹️ Stop
              </button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteAudio('${audioFile.id}', '${this.escapeHtml(audioFile.name)}')">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      `).join('');

      audioGrid.innerHTML = audioHTML;
      console.warn('Could not verify audio file status');
    }
  };

  app.testAudio = async function(filename) {
    try {
      // If audio is already playing, stop it first
      if (this.currentlyPlaying) {
        await this.stopAudio();
      }

      this.setStatus('playing', 'Playing Audio');
      this.showNotification(`Playing: ${filename}`, 'info');
      
      // Update UI to show which audio is playing
      this.updateAudioPlayingState(filename, true);
      
      const result = await window.electronAPI.testAudio(filename);
      
      // Reset status when done
      this.setStatus('ready', 'Ready');
      this.updateAudioPlayingState(filename, false);
      
      if (result && result.success) {
        if (result.stopped) {
          this.showNotification(`Audio stopped: ${filename}`, 'info');
        } else {
          this.showNotification(`Audio completed: ${filename}`, 'success');
        }
      }
      
    } catch (error) {
      this.setStatus('error', 'Audio Error');
      this.updateAudioPlayingState(filename, false);
      
      let errorMessage = `Failed to play: ${filename}`;
      if (error.message.includes('not found') || error.message.includes('ENOENT')) {
        errorMessage += ' - File not found';
      } else if (error.message.includes('permission') || error.message.includes('EACCES')) {
        errorMessage += ' - Permission denied';
      } else if (error.message.includes('format')) {
        errorMessage += ' - Unsupported format';
      }
      
      this.showNotification(errorMessage, 'error');
    }
  };

  app.stopAudio = async function() {
    try {
      const result = await window.electronAPI.stopTestAudio();
      this.setStatus('ready', 'Ready');
      
      // Reset all audio UI states
      this.updateAudioPlayingState(null, false);
      
      if (result && result.stopped) {
        this.showNotification('Audio stopped', 'info');
      } else {
        this.showNotification('No audio was playing', 'info');
      }
    } catch (error) {
      this.showNotification('Failed to stop audio', 'error');
    }
  };

  // NEW: Update audio playing state in UI
  app.updateAudioPlayingState = function(playingFilename, isPlaying) {
    // Store currently playing filename
    this.currentlyPlaying = isPlaying ? playingFilename : null;
    
    // Update all audio file cards
    const audioFiles = document.querySelectorAll('.audio-file');
    audioFiles.forEach(audioFile => {
      const filename = audioFile.dataset.filename;
      const playBtn = audioFile.querySelector('.play-btn');
      const stopBtn = audioFile.querySelector('.stop-btn');
      
      if (isPlaying && filename === playingFilename) {
        // This file is playing
        audioFile.classList.add('playing');
        if (playBtn) {
          playBtn.textContent = '⏸️ Playing...';
          playBtn.disabled = true;
          playBtn.classList.add('playing');
        }
        if (stopBtn) {
          stopBtn.classList.add('active');
        }
      } else {
        // This file is not playing
        audioFile.classList.remove('playing');
        if (playBtn) {
          playBtn.textContent = '▶️ Play';
          playBtn.disabled = false;
          playBtn.classList.remove('playing');
        }
        if (stopBtn) {
          stopBtn.classList.remove('active');
        }
      }
    });
  };

  // REMOVED: setAudioControlsState function - no longer needed

  app.showAudioDetails = function(audioId) {
    const audioFile = this.data?.audioFiles?.find(af => af.id === audioId);
    if (!audioFile) {
      this.showNotification('Audio file not found', 'error');
      return;
    }

    const modalContent = `
      <div class="audio-details">
        <div class="detail-section">
          <h4>📋 Basic Information</h4>
          <div class="detail-grid">
            <div class="detail-item">
              <strong>Name:</strong>
              <span>${this.escapeHtml(audioFile.name)}</span>
            </div>
            <div class="detail-item">
              <strong>Filename:</strong>
              <span class="monospace">${this.escapeHtml(audioFile.filename)}</span>
            </div>
            <div class="detail-item">
              <strong>File Size:</strong>
              <span>${this.formatFileSize(audioFile.size)}</span>
            </div>
            <div class="detail-item">
              <strong>File Type:</strong>
              <span>${this.getFileTypeDisplay(audioFile.filename)}</span>
            </div>
            <div class="detail-item">
              <strong>Uploaded:</strong>
              <span>${this.formatUploadDate(audioFile.uploadedAt)}</span>
            </div>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>🎵 Audio Controls</h4>
          <div class="detail-controls">
            <button class="btn btn-success" onclick="app.testAudio('${audioFile.filename}')">
              ▶️ Play Audio
            </button>
            <button class="btn btn-secondary" onclick="app.stopAudio()">
              ⏹️ Stop Audio
            </button>
          </div>
        </div>
        
        <div class="detail-section">
          <h4>📊 Usage Information</h4>
          <div class="usage-info">
            <p>This audio file can be used in schedule events. Once added to an event's audio sequence, it will play automatically when the event triggers.</p>
            <p><strong>Usage in events:</strong> ${this.getAudioUsageCount(audioFile.filename)} event(s)</p>
          </div>
        </div>
      </div>
    `;

    const buttons = [
      {
        text: 'Close',
        class: 'btn btn-secondary',
        onclick: () => this.closeModal()
      },
      {
        text: 'Delete Audio',
        class: 'btn btn-danger',
        onclick: () => {
          this.closeModal();
          this.deleteAudio(audioFile.id, audioFile.name);
        }
      }
    ];

    this.showModal(`Audio Details - ${audioFile.name}`, modalContent, buttons);
  };

  app.getAudioUsageCount = function(filename) {
    if (!this.data?.schedules) return 0;
    
    let count = 0;
    Object.values(this.data.schedules).forEach(daySchedule => {
      daySchedule.forEach(event => {
        if (event.audioSequence) {
          event.audioSequence.forEach(audio => {
            if (audio.audioFile === filename) {
              count++;
            }
          });
        }
      });
    });
    
    return count;
  };

  app.testSystemAudio = async function() {
    try {
      this.showNotification('Testing system audio (you should hear a beep)...', 'info');
      
      const result = await window.electronAPI.testSystemAudio();
      
      if (result.success) {
        this.showNotification('System audio test completed! Did you hear a beep?', 'success');
      } else {
        this.showNotification('System audio test failed - no beep heard', 'error');
      }
      
    } catch (error) {
      this.showNotification('System audio test failed - check your audio drivers and speakers', 'error');
    }
  };

  app.showUploadAudioModal = function() {
    const modalContent = `
      <div class="upload-container">
        <div class="upload-header">
          <h4>📁 Upload Audio Files</h4>
          <p>Add audio files to use in your bell schedules</p>
        </div>
        
        <div class="drag-area" id="audioDragArea">
          <div class="drag-icon">🎵</div>
          <div class="drag-text">Drop audio files here or click to browse</div>
          <div class="drag-subtext">Multiple files supported</div>
          <input type="file" id="audioFileInput" multiple accept=".mp3,.wav,.m4a,.ogg,.aac" style="display: none;">
        </div>
        
        <div class="upload-info">
          <div class="supported-formats">
            <strong>📋 Supported Formats:</strong>
            <div class="format-list">
              <span class="format-tag">MP3</span>
              <span class="format-tag">WAV</span>
              <span class="format-tag">M4A</span>
              <span class="format-tag">OGG</span>
              <span class="format-tag">AAC</span>
            </div>
          </div>
          
          <div class="upload-limits">
            <strong>📏 Limits:</strong>
            <ul>
              <li>Maximum file size: 50MB per file</li>
              <li>Recommended: Keep files under 10MB for best performance</li>
              <li>Audio quality: 44.1kHz or higher recommended</li>
            </ul>
          </div>
        </div>
      </div>
    `;

    const buttons = [
      {
        text: 'Cancel',
        class: 'btn btn-secondary',
        onclick: () => this.closeModal()
      },
      {
        text: '📁 Browse Files',
        class: 'btn btn-primary',
        onclick: () => document.getElementById('audioFileInput').click()
      }
    ];

    this.showModal('Upload Audio Files', modalContent, buttons);
    
    setTimeout(() => this.setupUploadModal(), 100);
  };

  app.setupUploadModal = function() {
    const dragArea = document.getElementById('audioDragArea');
    const fileInput = document.getElementById('audioFileInput');
    
    if (!dragArea || !fileInput) return;

    dragArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      this.handleFiles(e.target.files);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragArea.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dragArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragArea.classList.remove('drag-over');
      });
    });

    dragArea.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      this.handleFiles(files);
    });
  };

  app.handleFiles = async function(files) {
    if (!files || files.length === 0) return;

    const validFiles = [];
    const invalidFiles = [];
    const maxSize = 50 * 1024 * 1024;
    const validExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'];

    Array.from(files).forEach(file => {
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      
      if (!validExtensions.includes(extension)) {
        invalidFiles.push({ file, reason: 'Invalid format' });
      } else if (file.size > maxSize) {
        invalidFiles.push({ file, reason: 'Too large (max 50MB)' });
      } else if (file.size === 0) {
        invalidFiles.push({ file, reason: 'Empty file' });
      } else {
        validFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      const invalidList = invalidFiles.map(item => 
        `• ${item.file.name} - ${item.reason}`
      ).join('\n');
      
      this.showNotification(
        `${invalidFiles.length} file(s) skipped:\n${invalidList}`, 
        'warning'
      );
    }

    if (validFiles.length === 0) {
      this.showNotification('No valid files selected', 'error');
      return;
    }

    this.showNotification(`Uploading ${validFiles.length} file(s)...`, 'info');
    this.closeModal();

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      
      try {
        this.showNotification(
          `Uploading ${i + 1}/${validFiles.length}: ${file.name}`, 
          'info'
        );

        const buffer = await window.electronAPI.readFileAsBuffer(file);
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${timestamp}_${safeName}`;

        await window.electronAPI.uploadAudioFile({
          filename: filename,
          buffer: buffer,
          displayName: file.name
        });

        successCount++;
        
      } catch (error) {
        errorCount++;
        this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
      }
    }

    if (successCount > 0) {
      await this.loadData();
      this.updateAudioLibrary();
      this.showNotification(
        `Upload completed! ${successCount} file(s) uploaded successfully` +
        (errorCount > 0 ? `, ${errorCount} failed` : ''),
        successCount > errorCount ? 'success' : 'warning'
      );
    } else {
      this.showNotification('All uploads failed', 'error');
    }
  };

  app.deleteAudio = async function(audioId, audioName) {
    try {
      const usageCount = this.getAudioUsageCount(
        this.data?.audioFiles?.find(af => af.id === audioId)?.filename
      );
      
      let confirmMessage = `Delete "${audioName}"?`;
      if (usageCount > 0) {
        confirmMessage += `\n\nWarning: This audio file is used in ${usageCount} event(s). ` +
                         `Deleting it will cause those events to fail when they try to play audio.`;
      }
      confirmMessage += '\n\nThis action cannot be undone.';
      
      if (!confirm(confirmMessage)) {
        return;
      }

      this.showNotification(`Deleting ${audioName}...`, 'info');

      await window.electronAPI.deleteAudioFile(audioId);
      
      await this.loadData();
      this.updateAudioLibrary();
      
      this.showNotification(`Deleted: ${audioName}`, 'success');
      
      if (usageCount > 0) {
        this.showNotification(
          `Warning: ${usageCount} event(s) may now fail to play audio`, 
          'warning'
        );
      }
      
    } catch (error) {
      this.showNotification(`Failed to delete: ${error.message}`, 'error');
    }
  };

  app.setupAudioDragDrop = function() {
    const audioGrid = document.getElementById('audioGrid');
    if (!audioGrid) return;

    audioGrid.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFiles(files);
      }
    });

    audioGrid.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
  };

  app.formatFileSize = function(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  app.getFileTypeDisplay = function(filename) {
    const ext = filename.split('.').pop().toUpperCase();
    const typeMap = {
      'MP3': 'MP3 Audio',
      'WAV': 'WAV Audio',
      'M4A': 'M4A Audio',
      'OGG': 'OGG Audio',
      'AAC': 'AAC Audio'
    };
    return typeMap[ext] || ext;
  };

  app.formatUploadDate = function(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const audioStyles = document.createElement('style');
  audioStyles.textContent = `
    .audio-file {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      margin-bottom: 1.5rem;
      border: 2px solid transparent;
      transition: all 0.3s ease;
    }
    
    .audio-file:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    }
    
    .audio-file.available { border-color: #28a745; }
    .audio-file.missing { border-color: #dc3545; background: #fff5f5; }
    .audio-file.unknown { border-color: #ffc107; }
    
    /* NEW: Playing state styles */
    .audio-file.playing { 
      border-color: #007bff; 
      background: #f0f8ff;
      box-shadow: 0 4px 20px rgba(0, 123, 255, 0.3);
    }
    
    .audio-header {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    
    .audio-info { 
      flex: 1; 
      min-width: 0;
    }
    
    .audio-name {
      font-weight: 600;
      font-size: 1.1rem;
      color: #2c3e50;
      margin-bottom: 0.25rem;
    }
    
    .audio-filename {
      color: #6c757d;
      font-size: 0.9rem;
      font-family: 'Courier New', monospace;
      margin-bottom: 0.5rem;
      background: #f8f9fa;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      display: inline-block;
    }
    
    .audio-metadata {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    
    .audio-size, .audio-type, .audio-uploaded {
      color: #6c757d;
      font-size: 0.8rem;
    }
    
    .audio-controls {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      padding-top: 0.5rem;
      border-top: 1px solid #e9ecef;
    }
    
    .audio-controls .btn { 
      min-width: 80px;
      padding: 0.6rem 1rem;
      font-size: 0.85rem;
      border-radius: 6px;
      flex-shrink: 0;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }
    
    /* NEW: Enhanced button states */
    .audio-controls .btn.playing {
      background: #dc3545 !important;
      animation: pulse 1.5s infinite;
    }
    
    .audio-controls .stop-btn.active {
      background: #ffc107 !important;
      color: #212529 !important;
      font-weight: bold;
    }
    
    .audio-status {
      display: none;
    }
    
    .audio-warning {
      display: none;
    }
    
    .upload-container { max-width: 600px; }
    
    .upload-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    
    .drag-area {
      border: 3px dashed #dee2e6;
      border-radius: 12px;
      padding: 3rem 2rem;
      text-align: center;
      cursor: pointer;
      margin-bottom: 1.5rem;
      transition: all 0.3s ease;
      background: #f8f9fa;
    }
    
    .drag-area:hover, .drag-area.drag-over {
      border-color: #667eea;
      background: #f0f3ff;
      transform: scale(1.02);
    }
    
    .drag-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      color: #6c757d;
    }
    
    .drag-text {
      font-size: 1.1rem;
      font-weight: 600;
      color: #495057;
      margin-bottom: 0.5rem;
    }
    
    .drag-subtext {
      color: #6c757d;
      font-size: 0.9rem;
    }
    
    .upload-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 1.5rem;
    }
    
    .supported-formats { margin-bottom: 1rem; }
    
    .format-list {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }
    
    .format-tag {
      background: #667eea;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    
    .upload-limits ul {
      margin: 0.5rem 0 0 1rem;
      padding: 0;
    }
    
    .upload-limits li {
      margin-bottom: 0.25rem;
      font-size: 0.9rem;
      color: #6c757d;
    }
    
    .audio-details { max-width: 600px; }
    
    .detail-section {
      margin-bottom: 2rem;
      padding: 1.5rem;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #667eea;
    }
    
    .detail-section h4 {
      margin-bottom: 1rem;
      color: #495057;
    }
    
    .detail-grid { display: grid; gap: 0.75rem; }
    
    .detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem;
      background: white;
      border-radius: 4px;
    }
    
    .detail-item strong { color: #495057; }
    
    .monospace {
      font-family: 'Courier New', monospace;
      background: #e9ecef;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }
    
    .detail-controls {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }
    
    .usage-info {
      background: white;
      padding: 1rem;
      border-radius: 6px;
      border: 1px solid #dee2e6;
    }
    
    .usage-info p {
      margin-bottom: 0.5rem;
      line-height: 1.5;
    }
    
    .usage-info p:last-child { margin-bottom: 0; }
    
    /* NEW: Pulse animation for playing state */
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.7; }
      100% { opacity: 1; }
    }
    
    @media (max-width: 1024px) {
      .audio-controls {
        gap: 0.5rem;
      }
      
      .audio-controls .btn {
        padding: 0.5rem 0.8rem;
        font-size: 0.8rem;
        min-width: 75px;
      }
    }
    
    @media (max-width: 768px) {
      .audio-file { 
        padding: 1rem; 
        margin-bottom: 1rem;
      }
      
      .audio-controls { 
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      
      .audio-controls .btn {
        min-width: 70px;
        padding: 0.5rem 0.7rem;
        font-size: 0.75rem;
      }
      
      .audio-metadata { 
        flex-direction: column; 
        gap: 0.25rem; 
        font-size: 0.75rem;
      }
      
      .detail-item { 
        flex-direction: column; 
        align-items: flex-start; 
        gap: 0.25rem; 
      }
      
      .detail-controls { 
        flex-direction: column; 
      }
      
      .format-list { 
        justify-content: center; 
      }
    }
    
    @media (max-width: 480px) {
      .audio-controls .btn {
        min-width: 65px;
        padding: 0.45rem 0.6rem;
        font-size: 0.7rem;
      }
      
      .audio-controls {
        gap: 0.4rem;
      }
    }
  `;
  document.head.appendChild(audioStyles);
});