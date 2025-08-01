/**
 * School Bell System - Utility Functions
 * Centralized utilities to eliminate code duplication across the application
 */

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} - HTML-escaped text
 */
export const escapeHtml = (text) => {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

/**
 * Capitalize the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
export const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Generate a unique ID
 * @returns {string} - Unique identifier
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Sanitize filename for safe file operations
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
export const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
};

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
};

// ============================================================================
// FILE UTILITIES
// ============================================================================

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Get file type display name from filename
 * @param {string} filename - Filename with extension
 * @returns {string} - Human-readable file type
 */
export const getFileTypeDisplay = (filename) => {
  if (!filename) return 'Unknown';
  const ext = filename.split('.').pop().toUpperCase();
  const typeMap = {
    'MP3': 'MP3 Audio',
    'WAV': 'WAV Audio',
    'M4A': 'M4A Audio',
    'OGG': 'OGG Audio',
    'AAC': 'AAC Audio',
    'FLAC': 'FLAC Audio',
    'JSON': 'JSON Data',
    'TXT': 'Text File',
    'PDF': 'PDF Document'
  };
  return typeMap[ext] || `${ext} File`;
};

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} - File extension (lowercase, with dot)
 */
export const getFileExtension = (filename) => {
  if (!filename) return '';
  const parts = filename.split('.');
  return parts.length > 1 ? '.' + parts.pop().toLowerCase() : '';
};

/**
 * Check if file is an audio file
 * @param {string} filename - Filename to check
 * @returns {boolean} - True if audio file
 */
export const isAudioFile = (filename) => {
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac'];
  return audioExtensions.includes(getFileExtension(filename));
};

/**
 * Read file as text (browser environment)
 * @param {File} file - File object
 * @returns {Promise<string>} - File content as text
 */
export const readFileAsText = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

/**
 * Read file as buffer (browser environment)
 * @param {File} file - File object
 * @returns {Promise<Uint8Array>} - File content as buffer
 */
export const readFileAsBuffer = (file) => {
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
};

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Format time until next event
 * @param {number} seconds - Seconds until event
 * @returns {string} - Formatted time string
 */
export const formatTimeUntil = (seconds) => {
  if (seconds < 0) return 'Past';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
};

/**
 * Format upload/creation date
 * @param {string|Date} dateString - Date string or Date object
 * @returns {string} - Formatted date string
 */
export const formatUploadDate = (dateString) => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
};

/**
 * Format date for display
 * @param {string|Date} dateString - Date string or Date object
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} - Formatted date
 */
export const formatDate = (dateString, includeTime = false) => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  if (includeTime) {
    return date.toLocaleString();
  }
  return date.toLocaleDateString();
};

/**
 * Get current time in HH:MM:SS format
 * @returns {string} - Current time
 */
export const getCurrentTime = () => {
  return new Date().toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Parse time string to seconds since midnight
 * @param {string} timeString - Time in HH:MM or HH:MM:SS format
 * @returns {number} - Seconds since midnight
 */
export const parseTimeToSeconds = (timeString) => {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  const seconds = parseInt(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
};

/**
 * Format seconds to HH:MM:SS
 * @param {number} totalSeconds - Total seconds
 * @returns {string} - Formatted time string
 */
export const formatSecondsToTime = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return [hours, minutes, seconds]
    .map(val => String(val).padStart(2, '0'))
    .join(':');
};

/**
 * Validate time string format
 * @param {string} timeString - Time string to validate
 * @returns {boolean} - True if valid time format
 */
export const isValidTime = (timeString) => {
  if (!timeString) return false;
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
  return timeRegex.test(timeString);
};

// ============================================================================
// ARRAY & OBJECT UTILITIES
// ============================================================================

/**
 * Deep clone an object
 * @param {any} obj - Object to clone
 * @returns {any} - Cloned object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
};

/**
 * Sort array of objects by property
 * @param {Array} array - Array to sort
 * @param {string} property - Property to sort by
 * @param {boolean} ascending - Sort direction
 * @returns {Array} - Sorted array
 */
export const sortByProperty = (array, property, ascending = true) => {
  return [...array].sort((a, b) => {
    const aVal = a[property];
    const bVal = b[property];
    
    if (aVal < bVal) return ascending ? -1 : 1;
    if (aVal > bVal) return ascending ? 1 : -1;
    return 0;
  });
};

/**
 * Group array of objects by property
 * @param {Array} array - Array to group
 * @param {string} property - Property to group by
 * @returns {Object} - Grouped object
 */
export const groupByProperty = (array, property) => {
  return array.reduce((groups, item) => {
    const key = item[property];
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
};

/**
 * Remove duplicates from array
 * @param {Array} array - Array with potential duplicates
 * @param {string} [property] - Property to check for objects
 * @returns {Array} - Array without duplicates
 */
export const removeDuplicates = (array, property = null) => {
  if (!property) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const value = item[property];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

// ============================================================================
// FUNCTION UTILITIES
// ============================================================================

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function calls
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Promise that resolves when function succeeds
 */
export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 100) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result with score and feedback
 */
export const validatePassword = (password) => {
  const result = {
    isValid: false,
    score: 0,
    feedback: []
  };
  
  if (!password) {
    result.feedback.push('Password is required');
    return result;
  }
  
  if (password.length < 6) {
    result.feedback.push('Password must be at least 6 characters long');
  } else {
    result.score += 1;
  }
  
  if (!/\d/.test(password)) {
    result.feedback.push('Password must contain at least one number');
  } else {
    result.score += 1;
  }
  
  if (!/[a-z]/.test(password)) {
    result.feedback.push('Password must contain at least one lowercase letter');
  } else {
    result.score += 1;
  }
  
  if (!/[A-Z]/.test(password)) {
    result.feedback.push('Password must contain at least one uppercase letter');
  } else {
    result.score += 1;
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    result.feedback.push('Password should contain at least one special character');
  } else {
    result.score += 1;
  }
  
  result.isValid = result.score >= 2 && password.length >= 6;
  
  return result;
};

/**
 * Validate username format
 * @param {string} username - Username to validate
 * @returns {Object} - Validation result
 */
export const validateUsername = (username) => {
  const result = {
    isValid: false,
    feedback: []
  };
  
  if (!username) {
    result.feedback.push('Username is required');
    return result;
  }
  
  if (username.length < 3) {
    result.feedback.push('Username must be at least 3 characters long');
  }
  
  if (username.length > 20) {
    result.feedback.push('Username must be no more than 20 characters long');
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    result.feedback.push('Username can only contain letters, numbers, hyphens, and underscores');
  }
  
  result.isValid = result.feedback.length === 0;
  
  return result;
};

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Create standardized error object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {any} details - Additional error details
 * @returns {Object} - Standardized error object
 */
export const createError = (message, code = 'GENERIC_ERROR', details = null) => {
  return {
    message,
    code,
    details,
    timestamp: new Date().toISOString()
  };
};

/**
 * Handle and format error for user display
 * @param {Error|Object} error - Error object
 * @param {string} context - Context where error occurred
 * @returns {string} - User-friendly error message
 */
export const formatErrorForUser = (error, context = 'operation') => {
  if (!error) return `An unknown error occurred during ${context}`;
  
  const message = error.message || error.toString();
  
  // Common error patterns and user-friendly messages
  if (message.includes('ENOENT') || message.includes('not found')) {
    return 'File not found. Please check if the file exists.';
  }
  
  if (message.includes('EACCES') || message.includes('permission')) {
    return 'Permission denied. Please check file permissions.';
  }
  
  if (message.includes('EMFILE') || message.includes('too many files')) {
    return 'Too many files open. Please close some applications and try again.';
  }
  
  if (message.includes('network') || message.includes('ENOTFOUND')) {
    return 'Network error. Please check your internet connection.';
  }
  
  // Return original message if no pattern matches
  return `${context} failed: ${message}`;
};

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Safe JSON parse with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {any} fallback - Fallback value if parsing fails
 * @returns {any} - Parsed object or fallback
 */
export const safeJsonParse = (jsonString, fallback = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return fallback;
  }
};

/**
 * Safe JSON stringify
 * @param {any} obj - Object to stringify
 * @param {string} fallback - Fallback string if stringify fails
 * @returns {string} - JSON string or fallback
 */
export const safeJsonStringify = (obj, fallback = '{}') => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    return fallback;
  }
};

// ============================================================================
// PLATFORM UTILITIES
// ============================================================================

/**
 * Get current platform
 * @returns {string} - Platform name (win32, darwin, linux)
 */
export const getPlatform = () => {
  if (typeof process !== 'undefined' && process.platform) {
    return process.platform;
  }
  
  // Browser fallback
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('win')) return 'win32';
  if (userAgent.includes('mac')) return 'darwin';
  if (userAgent.includes('linux')) return 'linux';
  return 'unknown';
};

/**
 * Check if running on Windows
 * @returns {boolean} - True if Windows
 */
export const isWindows = () => getPlatform() === 'win32';

/**
 * Check if running on macOS
 * @returns {boolean} - True if macOS
 */
export const isMacOS = () => getPlatform() === 'darwin';

/**
 * Check if running on Linux
 * @returns {boolean} - True if Linux
 */
export const isLinux = () => getPlatform() === 'linux';

// ============================================================================
// EXPORT ALL UTILITIES
// ============================================================================

// Default export with all utilities grouped
export default {
  // String utilities
  escapeHtml,
  capitalizeFirst,
  generateId,
  sanitizeFilename,
  truncateText,
  
  // File utilities
  formatFileSize,
  getFileTypeDisplay,
  getFileExtension,
  isAudioFile,
  readFileAsText,
  readFileAsBuffer,
  
  // Time utilities
  formatTimeUntil,
  formatUploadDate,
  formatDate,
  getCurrentTime,
  parseTimeToSeconds,
  formatSecondsToTime,
  isValidTime,
  
  // Array & object utilities
  deepClone,
  sortByProperty,
  groupByProperty,
  removeDuplicates,
  
  // Function utilities
  debounce,
  throttle,
  retryWithBackoff,
  
  // Validation utilities
  isValidEmail,
  validatePassword,
  validateUsername,
  
  // Error utilities
  createError,
  formatErrorForUser,
  
  // Storage utilities
  safeJsonParse,
  safeJsonStringify,
  
  // Platform utilities
  getPlatform,
  isWindows,
  isMacOS,
  isLinux
};