const fs = require('fs');
const https = require('https');
const url = require('url');

const zipPath = process.argv[2];
const uploadUrl = process.argv[3];

if (!zipPath || !uploadUrl) {
  console.error('Usage: node upload_to_s3.cjs <zipPath> <uploadUrl>');
  process.exit(1);
}

const stats = fs.statSync(zipPath);
const fileSizeInBytes = stats.size;
console.log(`Uploading ${zipPath} (${fileSizeInBytes} bytes)...`);

const parsedUrl = new url.URL(uploadUrl);
const options = {
  hostname: parsedUrl.hostname,
  path: parsedUrl.pathname + parsedUrl.search,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/zip',
    'Content-Length': fileSizeInBytes,
  },
};

const req = https.request(options, (res) => {
  console.log(`Upload status: ${res.statusCode} ${res.statusMessage}`);
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Upload successful!');
      process.exit(0);
    } else {
      console.error('Upload failed:', data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err);
  process.exit(1);
});

fs.createReadStream(zipPath).pipe(req);
