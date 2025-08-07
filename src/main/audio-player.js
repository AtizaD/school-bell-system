const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class AudioPlayer {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.currentProcess = null;
    this.volume = 80;
    this.platform = process.platform;
    this.isInitialized = false;
    this.isPlaying = false;
    this.pendingStop = false;
    this.currentPlayingFile = null;
  }

  async init() {
    if (this.isInitialized) return;
    
    const settings = this.dataManager.getSettings();
    this.volume = settings.volume || 80;
    
    const audioPath = settings.audioPath || path.join(require('electron').app.getPath('userData'), 'audio');
    await fs.mkdir(audioPath, { recursive: true });
    
    this.isInitialized = true;
  }

  async playAudio(filename) {
    if (this.isPlaying && !this.pendingStop) {
      await this.stopAllAudio();
    }

    try {
      this.isPlaying = true;
      this.currentPlayingFile = filename;
      await this.stopAllAudio();
      
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(require('electron').app.getPath('userData'), 'audio');
      const filePath = path.join(audioPath, filename);
      
      await fs.access(filePath);
      
      this.currentProcess = this.startAudioProcess(filePath, this.volume);
      
      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        
        if (this.currentProcess.stdout) {
          this.currentProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });
        }
        
        if (this.currentProcess.stderr) {
          this.currentProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }
        
        this.currentProcess.on('close', (code, signal) => {
          this.currentProcess = null;
          this.isPlaying = false;
          this.currentPlayingFile = null;
          
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            resolve({ success: true, stopped: true, filename });
          } else if (code === 0) {
            resolve({ success: true, completed: true, filename });
          } else {
            if (this.platform === 'win32' && !this.hasTriedFallback) {
              this.hasTriedFallback = true;
              this.playAudioFallback(filename).then(resolve).catch(reject);
              return;
            }
            reject(new Error(`Audio playback failed: ${filename}`));
          }
        });
        
        this.currentProcess.on('error', (error) => {
          this.currentProcess = null;
          this.isPlaying = false;
          
          if (this.platform === 'win32' && !this.hasTriedFallback) {
            this.hasTriedFallback = true;
            this.playAudioFallback(filename).then(resolve).catch(reject);
            return;
          }
          
          reject(error);
        });
      });
      
    } catch (error) {
      this.isPlaying = false;
      throw error;
    }
  }

  async playAudioFallback(filename) {
    try {
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(require('electron').app.getPath('userData'), 'audio');
      const filePath = path.join(audioPath, filename);
      
      this.currentProcess = spawn('powershell', [
        '-Command',
        `
        $sound = New-Object System.Media.SoundPlayer;
        $sound.SoundLocation = '${filePath}';
        $sound.PlaySync();
        `
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      
      return new Promise((resolve, reject) => {
        this.currentProcess.on('close', (code, signal) => {
          this.currentProcess = null;
          this.isPlaying = false;
          this.currentPlayingFile = null;
          this.hasTriedFallback = false;
          
          if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            resolve({ success: true, stopped: true, filename });
          } else if (code === 0) {
            resolve({ success: true, completed: true, filename });
          } else {
            reject(new Error(`Fallback audio playback failed: ${filename}`));
          }
        });
        
        this.currentProcess.on('error', (error) => {
          this.currentProcess = null;
          this.isPlaying = false;
          this.hasTriedFallback = false;
          reject(error);
        });
      });
      
    } catch (error) {
      this.isPlaying = false;
      this.hasTriedFallback = false;
      throw error;
    }
  }

  async testAudio(filename) {
    try {
      return await this.playAudio(filename);
    } catch (error) {
      throw error;
    }
  }

  startAudioProcess(filePath, volume) {
    switch (this.platform) {
      case 'win32':
        return spawn('powershell', [
          '-ExecutionPolicy', 'Bypass',
          '-Command',
          `
          Add-Type -AssemblyName PresentationCore;
          $mediaPlayer = New-Object System.Windows.Media.MediaPlayer;
          $mediaPlayer.Volume = ${volume / 100};
          $mediaPlayer.Open([System.Uri]::new('${filePath.replace(/\\/g, '/')}'));
          $mediaPlayer.Play();
          Start-Sleep -Seconds 1;
          while($mediaPlayer.NaturalDuration.HasTimeSpan -eq $false) { 
            Start-Sleep -Milliseconds 100;
          }
          $duration = $mediaPlayer.NaturalDuration.TimeSpan.TotalSeconds;
          Start-Sleep -Seconds $duration;
          $mediaPlayer.Stop();
          $mediaPlayer.Close();
          `.replace(/\s+/g, ' ')
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        
      case 'darwin':
        return spawn('afplay', [filePath], { stdio: 'ignore' });
        
      case 'linux':
        return spawn('paplay', [filePath], { stdio: 'ignore' });
        
      default:
        throw new Error(`Platform ${this.platform} not supported`);
    }
  }

  async stopAllAudio() {
    if (this.pendingStop) {
      return { success: true, stopped: false };
    }

    this.pendingStop = true;
    let stopped = false;
    
    try {
      if (this.currentProcess) {
        this.currentProcess.kill('SIGTERM');
        
        await new Promise(resolve => {
          const timeout = setTimeout(() => {
            if (this.currentProcess) {
              this.currentProcess.kill('SIGKILL');
            }
            resolve();
          }, 1000);
          
          if (this.currentProcess) {
            this.currentProcess.on('close', () => {
              clearTimeout(timeout);
              resolve();
            });
          } else {
            clearTimeout(timeout);
            resolve();
          }
        });
        
        this.currentProcess = null;
        stopped = true;
      }
      
      this.isPlaying = false;
      this.currentPlayingFile = null;
      return { success: true, stopped };
      
    } finally {
      this.pendingStop = false;
    }
  }

  async stop() {
    return await this.stopAllAudio();
  }

  async stopTestAudio() {
    return await this.stopAllAudio();
  }

  async playEventSequence(event) {
    try {
      if (!event.audioSequence || event.audioSequence.length === 0) {
        throw new Error('No audio sequence defined');
      }
      
      await this.stopAllAudio();
      
      for (const audioItem of event.audioSequence) {
        const repeat = audioItem.repeat || 1;
        
        for (let i = 0; i < repeat; i++) {
          await this.playAudio(audioItem.audioFile);
          
          if (i < repeat - 1) {
            const settings = this.dataManager.getSettings();
            const audioRepeatInterval = (settings.audioRepeatInterval || 3) * 1000; // Convert to milliseconds
            await new Promise(resolve => setTimeout(resolve, audioRepeatInterval));
          }
        }
      }
      
    } catch (error) {
      throw error;
    }
  }

  async setVolume(volume) {
    this.volume = Math.max(0, Math.min(100, volume));
    
    // If audio is currently playing, restart it with the new volume
    if (this.isPlaying && this.currentProcess && this.currentPlayingFile) {
      try {
        // Stop current audio
        await this.stopAllAudio();
        
        // Restart with new volume
        await this.playAudio(this.currentPlayingFile);
      } catch (error) {
        console.warn('Failed to apply real-time volume change:', error.message);
      }
    }
  }

  getVolume() {
    return this.volume;
  }

  async getAvailableAudioFiles() {
    try {
      const settings = this.dataManager.getSettings();
      const audioPath = settings.audioPath || path.join(require('electron').app.getPath('userData'), 'audio');
      
      const files = await fs.readdir(audioPath);
      const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'];
      
      return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return audioExtensions.includes(ext);
      });
      
    } catch (error) {
      return [];
    }
  }

  getPlayingStatus() {
    return {
      isPlaying: this.isPlaying,
      hasCurrentProcess: !!this.currentProcess,
      pendingStop: this.pendingStop,
      volume: this.volume,
      platform: this.platform,
      hasTriedFallback: this.hasTriedFallback || false
    };
  }

  async testSystemAudio() {
    try {
      await this.stopAllAudio();
      
      if (this.platform === 'win32') {
        const testProcess = spawn('powershell', [
          '-Command',
          '[console]::beep(800,500)'
        ], { stdio: 'pipe' });
        
        return new Promise((resolve, reject) => {
          testProcess.on('close', (code) => {
            if (code === 0) {
              resolve({ success: true, message: 'System beep successful' });
            } else {
              reject(new Error('System beep failed'));
            }
          });
          
          testProcess.on('error', (error) => {
            reject(error);
          });
        });
      } else {
        return { success: true, message: 'Platform test not available' };
      }
      
    } catch (error) {
      throw error;
    }
  }

  async validateAudioSequence(audioSequence) {
    if (!Array.isArray(audioSequence) || audioSequence.length === 0) {
      throw new Error('Audio sequence must be a non-empty array');
    }
    
    const availableFiles = await this.getAvailableAudioFiles();
    const missingFiles = [];
    
    for (const audioItem of audioSequence) {
      if (!audioItem.audioFile || !availableFiles.includes(audioItem.audioFile)) {
        missingFiles.push(audioItem.audioFile);
      }
    }
    
    if (missingFiles.length > 0) {
      throw new Error(`Missing audio files: ${missingFiles.join(', ')}`);
    }
    
    return true;
  }

  updateSettings(updates) {
    if (updates.volume !== undefined) {
      this.setVolume(updates.volume);
    }
  }

  async cleanup() {
    await this.stopAllAudio();
  }
}

module.exports = AudioPlayer;