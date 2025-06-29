const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // Changed from 'bcrypt' to 'bcryptjs'
const { machineIdSync } = require('node-machine-id');
const { app } = require('electron');

class AuthManager {
  constructor() {
    this.authFilePath = path.join(app.getPath('userData'), 'auth-data.enc');
    this.appSalt = 'school-bell-system-2025-secure';
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.saltRounds = 12;
    this.currentSession = null;
    this.sessionTimeout = 15 * 60 * 1000; // 15 minutes in milliseconds
    this.activityTimer = null;
  }

  /**
   * Generate machine-specific encryption key
   */
  generateEncryptionKey() {
    try {
      const machineId = machineIdSync();
      const combined = machineId + this.appSalt;
      return crypto.pbkdf2Sync(combined, 'auth-salt', 100000, this.keyLength, 'sha256');
    } catch (error) {
      // Fallback if machine ID fails
      const fallbackSeed = require('os').hostname() + require('os').platform() + this.appSalt;
      return crypto.pbkdf2Sync(fallbackSeed, 'auth-salt', 100000, this.keyLength, 'sha256');
    }
  }

  /**
   * Encrypt data using AES-256-GCM (FIXED - using proper modern crypto methods)
   */
  encryptData(data) {
    const key = this.generateEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    
    // Use createCipheriv instead of deprecated createCipher
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    cipher.setAAD(Buffer.from(this.appSalt));
    
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      version: '2.0', // Updated version to indicate new crypto method
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      machineFingerprint: this.getMachineFingerprint()
    };
  }

  /**
   * Decrypt data using AES-256-GCM (FIXED - using proper modern crypto methods)
   */
  decryptData(encryptedObj) {
    // Handle both old and new versions for migration
    if (encryptedObj.version === '1.0') {
      return this.decryptDataLegacy(encryptedObj);
    }
    
    if (encryptedObj.version !== '2.0') {
      throw new Error('Unsupported auth data version');
    }

    if (encryptedObj.machineFingerprint !== this.getMachineFingerprint()) {
      throw new Error('Auth data is bound to a different machine');
    }

    const key = this.generateEncryptionKey();
    const iv = Buffer.from(encryptedObj.iv, 'hex');
    
    // Use createDecipheriv instead of deprecated createDecipher
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAAD(Buffer.from(this.appSalt));
    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

    let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  /**
   * Legacy decryption for version 1.0 data (for migration)
   */
  decryptDataLegacy(encryptedObj) {
    try {
      if (encryptedObj.machineFingerprint !== this.getMachineFingerprint()) {
        throw new Error('Auth data is bound to a different machine');
      }

      const key = this.generateEncryptionKey();
      
      // Try to use the deprecated method for legacy data
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from(this.appSalt));
      decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

      let decrypted = decipher.update(encryptedObj.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);
      
      // Migrate to new format
      console.log('Migrating auth data to new encryption format...');
      this.migrateAuthData(data);
      
      return data;
    } catch (error) {
      console.error('Failed to decrypt legacy auth data:', error.message);
      throw new Error('Failed to decrypt authentication data. You may need to reset the setup.');
    }
  }

  /**
   * Migrate old auth data to new encryption format
   */
  async migrateAuthData(data) {
    try {
      const newEncryptedData = this.encryptData(data);
      const encryptedJson = JSON.stringify(newEncryptedData, null, 2);
      await fs.writeFile(this.authFilePath, encryptedJson, 'utf8');
      console.log('Auth data migration completed successfully');
    } catch (error) {
      console.error('Failed to migrate auth data:', error);
    }
  }

  /**
   * Get machine fingerprint for binding
   */
  getMachineFingerprint() {
    try {
      const machineId = machineIdSync();
      const platform = require('os').platform();
      const hostname = require('os').hostname();
      const combined = `${machineId}-${platform}-${hostname}`;
      return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
    } catch (error) {
      return 'fallback-fingerprint';
    }
  }

  /**
   * Check if auth file exists and setup is complete
   */
  async isSetupComplete() {
    try {
      await fs.access(this.authFilePath);
      const authData = await this.loadAuthData();
      return authData && authData.auth && authData.auth.isSetupComplete;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load and decrypt auth data
   */
  async loadAuthData() {
    try {
      const encryptedData = await fs.readFile(this.authFilePath, 'utf8');
      const encryptedObj = JSON.parse(encryptedData);
      return this.decryptData(encryptedObj);
    } catch (error) {
      console.error('Failed to load auth data:', error.message);
      throw new Error(`Failed to load auth data: ${error.message}`);
    }
  }

  /**
   * Save encrypted auth data
   */
  async saveAuthData(authData) {
    try {
      const encryptedObj = this.encryptData(authData);
      const encryptedJson = JSON.stringify(encryptedObj, null, 2);
      await fs.writeFile(this.authFilePath, encryptedJson, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save auth data: ${error.message}`);
    }
  }

  /**
   * Create initial admin user (first-time setup)
   */
  async createAdminUser(username, password) {
    try {
      // Validate input
      if (!username || username.length < 3 || username.length > 20) {
        throw new Error('Username must be 3-20 characters long');
      }

      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      if (!/\d/.test(password)) {
        throw new Error('Password must contain at least one number');
      }

      // Check if setup already complete
      if (await this.isSetupComplete()) {
        throw new Error('Admin user already exists');
      }

      // Hash password using bcryptjs (synchronous method)
      const passwordHash = bcrypt.hashSync(password, this.saltRounds);

      // Create auth data
      const authData = {
        auth: {
          adminUser: {
            username: username.trim(),
            passwordHash: passwordHash,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginCount: 0
          },
          isSetupComplete: true,
          version: '2.0' // Updated version
        }
      };

      // Save encrypted
      await this.saveAuthData(authData);

      console.log('Admin user created successfully with bcryptjs');

      return {
        success: true,
        message: 'Admin user created successfully'
      };

    } catch (error) {
      console.error('Failed to create admin user:', error);
      throw error;
    }
  }

  /**
   * Authenticate user login
   */
  async login(username, password) {
    try {
      console.log(`Login attempt for user: ${username}`);
      
      // Load auth data
      const authData = await this.loadAuthData();
      
      if (!authData.auth || !authData.auth.adminUser) {
        console.error('No admin user found in auth data');
        throw new Error('No admin user found. Please complete setup first.');
      }

      const adminUser = authData.auth.adminUser;
      console.log(`Found admin user: ${adminUser.username}`);

      // Check username (case-insensitive)
      if (adminUser.username.toLowerCase() !== username.trim().toLowerCase()) {
        console.error(`Username mismatch: expected '${adminUser.username}', got '${username}'`);
        throw new Error('Invalid username or password');
      }

      // Check password using bcryptjs (synchronous method)
      const passwordMatch = bcrypt.compareSync(password, adminUser.passwordHash);
      if (!passwordMatch) {
        console.error('Password does not match');
        throw new Error('Invalid username or password');
      }

      console.log('Login successful');

      // Update login info
      adminUser.lastLogin = new Date().toISOString();
      adminUser.loginCount = (adminUser.loginCount || 0) + 1;
      await this.saveAuthData(authData);

      // Create session
      this.currentSession = {
        username: adminUser.username,
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        sessionId: crypto.randomBytes(16).toString('hex')
      };

      // Start activity timer
      this.startActivityTimer();

      return {
        success: true,
        user: {
          username: adminUser.username,
          lastLogin: adminUser.lastLogin,
          loginCount: adminUser.loginCount
        },
        sessionId: this.currentSession.sessionId
      };

    } catch (error) {
      console.error('Login failed:', error.message);
      throw error;
    }
  }

  /**
   * Logout current session
   */
  logout() {
    this.currentSession = null;
    this.stopActivityTimer();
    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Check if user is currently logged in
   */
  isLoggedIn() {
    return this.currentSession !== null;
  }

  /**
   * Get current session info
   */
  getCurrentSession() {
    return this.currentSession;
  }

  /**
   * Update activity (reset session timeout)
   */
  updateActivity() {
    if (this.currentSession) {
      this.currentSession.lastActivity = new Date().toISOString();
      this.resetActivityTimer();
    }
  }

  /**
   * Start activity timer for auto-logout
   */
  startActivityTimer() {
    this.stopActivityTimer(); // Clear existing timer
    
    this.activityTimer = setTimeout(() => {
      if (this.currentSession) {
        console.log('Session expired due to inactivity');
        this.logout();
        // Emit session expired event (will be handled by main process)
        if (this.onSessionExpired) {
          this.onSessionExpired();
        }
      }
    }, this.sessionTimeout);
  }

  /**
   * Reset activity timer
   */
  resetActivityTimer() {
    this.startActivityTimer();
  }

  /**
   * Stop activity timer
   */
  stopActivityTimer() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
  }

  /**
   * Get admin user info (without sensitive data)
   */
  async getAdminInfo() {
    try {
      const authData = await this.loadAuthData();
      const adminUser = authData.auth.adminUser;
      
      return {
        username: adminUser.username,
        createdAt: adminUser.createdAt,
        lastLogin: adminUser.lastLogin,
        loginCount: adminUser.loginCount || 0
      };
    } catch (error) {
      throw new Error('Failed to get admin info');
    }
  }

  /**
   * Change admin password
   */
  async changePassword(currentPassword, newPassword) {
    try {
      // Load current auth data
      const authData = await this.loadAuthData();
      const adminUser = authData.auth.adminUser;

      // Verify current password using bcryptjs (synchronous method)
      const passwordMatch = bcrypt.compareSync(currentPassword, adminUser.passwordHash);
      if (!passwordMatch) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      if (!newPassword || newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long');
      }

      if (!/\d/.test(newPassword)) {
        throw new Error('New password must contain at least one number');
      }

      // Hash new password using bcryptjs (synchronous method)
      const newPasswordHash = bcrypt.hashSync(newPassword, this.saltRounds);

      // Update auth data
      adminUser.passwordHash = newPasswordHash;
      adminUser.passwordChangedAt = new Date().toISOString();

      await this.saveAuthData(authData);

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Reset setup (for development/recovery)
   */
  async resetSetup() {
    try {
      await fs.unlink(this.authFilePath);
      this.logout();
      console.log('Setup reset completed');
      return { success: true, message: 'Setup reset successfully' };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, that's fine
        return { success: true, message: 'Setup was already reset' };
      }
      throw new Error('Failed to reset setup');
    }
  }

  /**
   * Set session expired callback
   */
  onSessionExpired(callback) {
    this.onSessionExpired = callback;
  }

  /**
   * Cleanup on app close
   */
  cleanup() {
    this.stopActivityTimer();
    this.logout();
  }

  /**
   * Debug method to check auth file status
   */
  async debugAuthStatus() {
    try {
      const exists = await fs.access(this.authFilePath).then(() => true).catch(() => false);
      console.log('Auth file exists:', exists);
      
      if (exists) {
        const stats = await fs.stat(this.authFilePath);
        console.log('Auth file size:', stats.size);
        console.log('Auth file modified:', stats.mtime);
        
        try {
          const encryptedData = await fs.readFile(this.authFilePath, 'utf8');
          const encryptedObj = JSON.parse(encryptedData);
          console.log('Auth file version:', encryptedObj.version);
          console.log('Machine fingerprint match:', encryptedObj.machineFingerprint === this.getMachineFingerprint());
        } catch (parseError) {
          console.error('Failed to parse auth file:', parseError.message);
        }
      }
    } catch (error) {
      console.error('Debug auth status failed:', error);
    }
  }
}

module.exports = AuthManager;