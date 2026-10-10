// Launches the unmodified test-runner.js with a Chrome that actually starts on this machine.
// puppeteer 21 bundles Chrome 121, which crashes on very recent macOS releases; if it fails to
// launch we fall back to a newer cached Chrome for Testing or the installed Google Chrome.
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');

function candidates() {
  const list = [];
  if (process.env.PUPPETEER_EXECUTABLE_PATH) list.push(process.env.PUPPETEER_EXECUTABLE_PATH);
  try { list.push(puppeteer.executablePath()); } catch { /* no bundled browser */ }
  const cache = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(cache)) {
    fs.readdirSync(cache).sort().reverse().forEach((dir) => {
      const base = path.join(cache, dir);
      [
        'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-linux64/chrome',
        'chrome-win64/chrome.exe'
      ].forEach((p) => list.push(path.join(base, p)));
    });
  }
  list.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  );
  return [...new Set(list)].filter((p) => p && fs.existsSync(p));
}

(async () => {
  for (const executablePath of candidates()) {
    try {
      // Probe with exactly the options test-runner.js uses
      const browser = await puppeteer.launch({ headless: true, executablePath });
      await browser.close();
      process.env.PUPPETEER_EXECUTABLE_PATH = executablePath;
      break;
    } catch { /* try the next one */ }
  }
  // puppeteer reads PUPPETEER_EXECUTABLE_PATH when it is first imported, so run the (unmodified)
  // test runner in a fresh process that inherits the chosen browser.
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, [path.join(__dirname, 'test-runner.js')], { stdio: 'inherit', env: process.env });
  child.on('exit', (code) => process.exit(code ?? 1));
})();
