const fs = require('fs');
const path = require('path');
const https = require('https');

const fontsDir = path.resolve('apps/web/public/fonts');
fs.mkdirSync(fontsDir, { recursive: true });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✔ Downloaded: ${path.basename(dest)} (${fs.statSync(dest).size} bytes)`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Downloading fonts for offline bundling...');
  
  // 1. Material Symbols Outlined (variable font)
  const msUrl = 'https://fonts.gstatic.com/s/materialsymbolsoutlined/v371/kJF1BvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oDMzByHX9rA6RzaxHMPdY43zj-jCxv3fzvRNU22ZXGJpEpjC_1v-p_4MrImHCIJIZrDCvHeem.ttf';
  await downloadFile(msUrl, path.join(fontsDir, 'MaterialSymbolsOutlined.ttf'));

  // 2. Inter Regular and Bold
  const interUrl = 'https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2';
  await downloadFile(interUrl, path.join(fontsDir, 'Inter.woff2'));

  console.log('All fonts downloaded successfully to apps/web/public/fonts/');
}

main().catch(err => {
  console.error('Error downloading fonts:', err);
  process.exit(1);
});
