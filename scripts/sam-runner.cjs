const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const projectRoot = path.resolve(__dirname, '..');
const localBin = path.join(projectRoot, 'node_modules', '.bin');
const backendBin = path.join(projectRoot, 'backend', 'node_modules', '.bin');

// Potential SAM CLI installation paths on Windows
const samInstallPaths = [
  'C:\\Program Files\\Amazon\\AWSSAMCLI\\bin',
  'C:\\Program Files (x86)\\Amazon\\AWSSAMCLI\\bin',
];

const foundSamDir = samInstallPaths.find((p) => fs.existsSync(p));

// Construct enriched PATH containing local binaries and SAM directory
const pathDelimiter = path.delimiter;
const existingPath = process.env.PATH || '';
const enrichedPaths = [localBin, backendBin];
if (foundSamDir) {
  enrichedPaths.push(foundSamDir);
}
enrichedPaths.push(existingPath);

const env = {
  ...process.env,
  PATH: enrichedPaths.join(pathDelimiter),
  SAM_CLI_TELEMETRY: '0',
};

// Locate SAM executable
let samExecutable = 'sam';
if (process.platform === 'win32' && foundSamDir) {
  const samCmd = path.join(foundSamDir, 'sam.cmd');
  if (fs.existsSync(samCmd)) {
    samExecutable = `"${samCmd}"`;
  }
}

const child = spawn(samExecutable, args, {
  stdio: 'inherit',
  shell: true,
  env,
  cwd: projectRoot,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
