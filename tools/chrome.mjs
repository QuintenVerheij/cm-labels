// Where Google Chrome and the per-user app data live, on Windows and macOS (for icons.mjs and ext-test.mjs).
import os from 'node:os';
import path from 'node:path';

const mac = process.platform === 'darwin';

// The default Google Chrome install.
export const chromeExe = mac
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`;

// %LOCALAPPDATA% on Windows, ~/Library/Application Support on macOS.
export const appDataDir = mac ? path.join(os.homedir(), 'Library', 'Application Support') : process.env.LOCALAPPDATA;
