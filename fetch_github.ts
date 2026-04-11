import fs from 'fs';
import https from 'https';

function downloadFile(url: string, dest: string) {
  return new Promise<void>((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        fs.writeFileSync(dest, data);
        console.log(`Downloaded ${url} to ${dest}`);
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    await downloadFile('https://raw.githubusercontent.com/MunirKhattak/RideShare/main/src/App.tsx', './src/App.tsx');
    await downloadFile('https://raw.githubusercontent.com/MunirKhattak/RideShare/main/src/index.css', './src/index.css');
    console.log('Done fetching files from GitHub.');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
