/**
 * HTML5 Audio Player for School Bell System
 * Provides real-time volume control and better audio management
 */

(function() {
  'use strict';

  class HTML5AudioPlayer {
    constructor() {
      this.audio = null;
      this.volume = 80;
      this.isPlaying = false;
      this.currentFile = null;
    }

    async playAudio(filename) {
      try {
          
        // Stop any currently playing audio
        await this.stopAudio();

        // Create new audio element
        this.audio = new Audio();
        this.currentFile = filename;
        this.isPlaying = true;

        // Set up audio properties
        this.audio.volume = this.volume / 100;
        this.audio.preload = 'auto';
        

        // Create file URL from the audio directory
        const audioUrl = await this.getAudioFileUrl(filename);
        this.audio.src = audioUrl;

        // Set up event listeners
        this.setupAudioEvents();

        // Set up a promise to handle both success and error cases
        return new Promise((resolve, reject) => {
          const cleanup = () => {
            this.audio.removeEventListener('canplaythrough', onCanPlay);
            this.audio.removeEventListener('error', onError);
            this.audio.removeEventListener('loadstart', onLoadStart);
          };

          const onCanPlay = async () => {
            try {
              
              await this.audio.play();
              cleanup();
              resolve({ success: true, filename });
            } catch (playError) {
              console.error('HTML5 audio.play() failed:', playError);
              cleanup();
              this.isPlaying = false;
              this.currentFile = null;
              reject(new Error(`Failed to play audio: ${playError.message}`));
            }
          };

          const onError = () => {
            cleanup();
            this.isPlaying = false;
            this.currentFile = null;
            const error = this.audio.error;
            let errorMessage = 'HTML5 audio failed to load';
            if (error) {
              errorMessage = `HTML5 audio error (code: ${error.code})`;
            }
            reject(new Error(errorMessage));
          };

          const onLoadStart = () => {
              };

          this.audio.addEventListener('canplaythrough', onCanPlay, { once: true });
          this.audio.addEventListener('error', onError, { once: true });
          this.audio.addEventListener('loadstart', onLoadStart, { once: true });

          // Start loading the audio
          this.audio.load();
        });

      } catch (error) {
        this.isPlaying = false;
        this.currentFile = null;
        throw new Error(`Failed to play audio: ${error.message}`);
      }
    }

    async stopAudio() {
      if (this.audio) {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = '';
        
        // Remove all event listeners to prevent errors after nullification
        this.audio.removeEventListener('ended', this.onAudioEnded);
        this.audio.removeEventListener('error', this.onAudioError);
        this.audio.removeEventListener('pause', this.onAudioPause);
        this.audio.removeEventListener('play', this.onAudioPlay);
        
        this.audio = null;
      }
      this.isPlaying = false;
      this.currentFile = null;
      return { success: true, stopped: true };
    }

    setVolume(volume) {
      this.volume = Math.max(0, Math.min(100, volume));
      
      // Apply to currently playing audio immediately
      if (this.audio && !this.audio.paused) {
        this.audio.volume = this.volume / 100;
      }
    }

    getVolume() {
      return this.volume;
    }

    isAudioPlaying() {
      return this.isPlaying && this.audio && !this.audio.paused;
    }

    getCurrentFile() {
      return this.currentFile;
    }

    setupAudioEvents() {
      if (!this.audio) return;

      // Store event handlers as properties so they can be removed later
      this.onAudioEnded = () => {
        this.isPlaying = false;
        this.currentFile = null;
      };

      this.onAudioError = (e) => {
        this.isPlaying = false;
        this.currentFile = null;
        
        // Check if audio object still exists before accessing its properties
        const error = this.audio ? this.audio.error : null;
        const audioSrc = this.audio ? this.audio.src : 'unknown';
        let errorMessage = 'Unknown audio error';
        
        if (error) {
          switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
              errorMessage = 'Audio playback was aborted';
              break;
            case error.MEDIA_ERR_NETWORK:
              errorMessage = 'Network error occurred while loading audio';
              break;
            case error.MEDIA_ERR_DECODE:
              errorMessage = 'Audio file format is not supported or corrupted';
              break;
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = 'Audio file format or source not supported';
              break;
            default:
              errorMessage = `Audio error (code: ${error.code})`;
              break;
          }
        }
        
        console.error('HTML5 Audio playback error:', errorMessage, 'Event:', e);
        console.error('Audio src:', audioSrc);
        console.error('Audio error object:', error);
      };

      this.onAudioPause = () => {
        this.isPlaying = false;
      };

      this.onAudioPlay = () => {
        this.isPlaying = true;
      };

      // Add event listeners
      this.audio.addEventListener('ended', this.onAudioEnded);
      this.audio.addEventListener('error', this.onAudioError);
      this.audio.addEventListener('pause', this.onAudioPause);
      this.audio.addEventListener('play', this.onAudioPlay);
    }

    async getAudioFileUrl(filename) {
      // Request the audio file URL from the main process
      try {
        const response = await window.electronAPI.getAudioFileUrl(filename);
        return response.url;
      } catch (error) {
        // Fallback: construct path-based URL
        console.warn('Could not get audio file URL, using fallback');
        return `file://${await window.electronAPI.getAudioFilePath(filename)}`;
      }
    }

    async testSystemAudio() {
      // Create a simple test tone using Web Audio API
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
        gainNode.gain.setValueAtTime(this.volume / 100 * 0.1, audioContext.currentTime); // Low volume

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5); // 500ms beep

        return { success: true, message: 'System audio test completed' };
      } catch (error) {
        throw new Error(`System audio test failed: ${error.message}`);
      }
    }

    async playAudioSequence(audioSequence) {
      try {
        for (const item of audioSequence) {
          const filename = item.audioFile;
          const repeatCount = item.repeat || 1;
          
          for (let i = 0; i < repeatCount; i++) {
            await this.playAudio(filename);
            
            // Wait for audio to complete
            await this.waitForCompletion();
            
            // Add a configurable delay between repetitions (except for the last one)
            if (i < repeatCount - 1) {
              const settings = await window.electronAPI.getSettings();
              const audioRepeatInterval = (settings.audioRepeatInterval || 3) * 1000; // Convert to milliseconds
              await this.delay(audioRepeatInterval);
            }
          }
          
          // Add a small delay between different audio files
          if (audioSequence.indexOf(item) < audioSequence.length - 1) {
            await this.delay(2000); // 1 second delay between different files
          }
        }
        
        return { success: true, message: 'Audio sequence completed' };
      } catch (error) {
        throw new Error(`Audio sequence playback failed: ${error.message}`);
      }
    }

    async waitForCompletion() {
      return new Promise((resolve) => {
        const checkCompletion = () => {
          if (!this.isAudioPlaying()) {
            resolve();
          } else {
            setTimeout(checkCompletion, 100);
          }
        };
        checkCompletion();
      });
    }

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Initialize the HTML5 audio player and expose it globally
  window.html5AudioPlayer = new HTML5AudioPlayer();

  // Extend the main app with HTML5 audio methods
  document.addEventListener('DOMContentLoaded', () => {
    if (window.app) {
      // Add HTML5 audio methods to the main app
      window.app.html5Audio = window.html5AudioPlayer;
    }
  });

})();