import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';

const APP_ID = 'd2h2pxsqugbcgb';
const BRANCH_NAME = 'main';
const REGION = 'ap-southeast-2';
const ZIP_PATH = 'frontend-dist.zip';

console.log('=== AWS Amplify Frontend Deployment ===');
console.log(`App ID: ${APP_ID}`);
console.log(`Branch: ${BRANCH_NAME}`);
console.log(`Region: ${REGION}`);

// 1. Create deployment
console.log('\n[1/4] Creating Amplify deployment...');
const createCmd = `aws amplify create-deployment --app-id ${APP_ID} --branch-name ${BRANCH_NAME} --region ${REGION} --output json`;
const createOutput = JSON.parse(execSync(createCmd, { encoding: 'utf8' }));
const { jobId, zipUploadUrl } = createOutput;
console.log(`✓ Deployment created. Job ID: ${jobId}`);

// 2. Upload zip
console.log('\n[2/4] Uploading frontend-dist.zip to S3 pre-signed URL...');
const fileData = fs.readFileSync(ZIP_PATH);
const url = new URL(zipUploadUrl);

await new Promise((resolve, reject) => {
  const req = https.request(
    url,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': fileData.length,
      },
    },
    (res) => {
      console.log(`✓ Upload response status: ${res.statusCode} ${res.statusMessage}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${res.statusCode}`));
      }
    }
  );

  req.on('error', reject);
  req.write(fileData);
  req.end();
});

// 3. Start deployment
console.log('\n[3/4] Starting Amplify deployment...');
const startCmd = `aws amplify start-deployment --app-id ${APP_ID} --branch-name ${BRANCH_NAME} --job-id ${jobId} --region ${REGION} --output json`;
const startOutput = JSON.parse(execSync(startCmd, { encoding: 'utf8' }));
console.log(`✓ Deployment started. Initial status: ${startOutput.jobSummary.status}`);

// 4. Poll job status
console.log('\n[4/4] Polling job status until completion...');
let currentStatus = startOutput.jobSummary.status;
let attempts = 0;
while (currentStatus === 'PENDING' || currentStatus === 'RUNNING' || currentStatus === 'PROVISIONING') {
  await new Promise((r) => setTimeout(r, 4000));
  attempts++;
  const checkCmd = `aws amplify get-job --app-id ${APP_ID} --branch-name ${BRANCH_NAME} --job-id ${jobId} --region ${REGION} --output json`;
  const jobOutput = JSON.parse(execSync(checkCmd, { encoding: 'utf8' }));
  currentStatus = jobOutput.job.summary.status;
  console.log(`[Attempt ${attempts}] Status: ${currentStatus}`);
}

console.log(`\n=== Final Deployment Status: ${currentStatus} ===`);
if (currentStatus !== 'SUCCEED') {
  console.error(`Deployment did not succeed. Final status: ${currentStatus}`);
  process.exit(1);
}

console.log('✓ Deployment successfully confirmed by AWS Amplify!');
