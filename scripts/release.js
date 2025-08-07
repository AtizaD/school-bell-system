#!/usr/bin/env node

/**
 * Release Helper Script
 * Automates the process of creating a new release
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'inherit', ...options });
  } catch (error) {
    log(`❌ Command failed: ${command}`, colors.red);
    process.exit(1);
  }
}

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function main() {
  const args = process.argv.slice(2);
  const versionType = args[0] || 'patch'; // patch, minor, major
  
  log('🔔 School Bell System Release Helper', colors.blue);
  log('=====================================', colors.blue);
  
  // Check if we're in the right directory
  if (!fs.existsSync('package.json')) {
    log('❌ package.json not found. Run this script from the project root.', colors.red);
    process.exit(1);
  }
  
  const currentVersion = getCurrentVersion();
  log(`📦 Current version: ${currentVersion}`, colors.yellow);
  
  // Check git status
  log('🔍 Checking git status...', colors.blue);
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    if (gitStatus.trim()) {
      log('⚠️  Warning: You have uncommitted changes.', colors.yellow);
      log('📝 Please commit or stash your changes before creating a release.', colors.yellow);
    }
  } catch (error) {
    log('❌ Git status check failed. Make sure you\'re in a git repository.', colors.red);
    process.exit(1);
  }
  
  // Bump version
  log(`📈 Bumping ${versionType} version...`, colors.blue);
  exec(`npm version ${versionType} --no-git-tag-version`);
  
  const newVersion = getCurrentVersion();
  log(`✅ New version: ${newVersion}`, colors.green);
  
  // Update README if needed
  log('📝 Updating README.md...', colors.blue);
  let readme = fs.readFileSync('README.md', 'utf8');
  readme = readme.replace(/v\d+\.\d+\.\d+/g, `v${newVersion}`);
  readme = readme.replace(/System Setup \d+\.\d+\.\d+\.exe/g, `System Setup ${newVersion}.exe`);
  fs.writeFileSync('README.md', readme);
  
  // Commit changes
  log('💾 Committing version bump...', colors.blue);
  exec('git add package.json README.md');
  exec(`git commit -m "Version bump to v${newVersion}"`);
  
  // Create git tag
  log(`🏷️  Creating git tag v${newVersion}...`, colors.blue);
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  
  // Push changes and tag
  log('🚀 Pushing to GitHub...', colors.blue);
  exec('git push origin main');
  exec(`git push origin v${newVersion}`);
  
  log('', colors.reset);
  log('🎉 Release process completed!', colors.green);
  log(`✅ Version v${newVersion} has been tagged and pushed`, colors.green);
  log('🔧 GitHub Actions will now build and create the release automatically', colors.blue);
  log('🔗 Check the Actions tab on GitHub for build progress', colors.blue);
  
  console.log(`
📋 Next Steps:
1. Monitor the GitHub Actions build: https://github.com/AtizaD/school-bell-system/actions
2. Once complete, the release will be available at: https://github.com/AtizaD/school-bell-system/releases
3. Users can download the appropriate installer for their platform
4. The auto-updater will notify existing users of the new version
  `);
}

if (require.main === module) {
  main();
}

module.exports = { getCurrentVersion, log, exec };