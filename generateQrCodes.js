#!/usr/bin/env node
const { QRCodeStyling } = require('qr-code-styling/lib/qr-code-styling.common.js');
const nodeCanvas       = require('canvas');
const { JSDOM }        = require('jsdom');
const fs               = require('fs').promises;
const path             = require('path');
const xlsx             = require('xlsx');
const { exec }         = require('child_process');

const FILE_PATH  = './ЗАО_ШОРО_QR.xlsx';
const BATCH_SIZE = 10;
const QR_ROOT    = './qr';

async function main() {
  await fs.mkdir(QR_ROOT, { recursive: true });
  const workbook = xlsx.readFile(FILE_PATH);

  function parseSheet(sheet) {
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    return rows
      // .slice(1) // drop header
      .filter(r => r[0])
      .map(r => [r[0]]);
  }

  async function processBatch(batch, outputDir) {
    return Promise.all(batch.map(async ([qrLink]) => {
      try {
        const qrCode = new QRCodeStyling({ jsdom: JSDOM, nodeCanvas, width:5000, height:5000, data:qrLink.trim(), image:"./logo.png",
          dotsOptions:{ gradient:{ type:"linear", colorStops:[{offset:0,color:"#12944C"},{offset:1,color:"#1E6E72"}], rotation:1.5708 }, type:"rounded" },
          cornersSquareOptions:{type:"extra-rounded"}, cornersDotOptions:{type:"extra-rounded"}, backgroundOptions:{color:"#fff"} 
        });
        const filename = ['qr'.replace(/\//g,'-')].join(' --- ') + '.png';
        const buffer   = await qrCode.getRawData("png");
        await fs.writeFile(path.join(outputDir, filename), buffer);
        return 'success';
      } catch {
        return 'error';
      }
    }));
  }

  for (const sheetName of workbook.SheetNames) {
    console.log(`Processing sheet: ${sheetName}`);
    const data = parseSheet(workbook.Sheets[sheetName]);
    if (!data.length) {
      console.warn(`⚠️ Sheet "${sheetName}" empty; skipping.`);
      continue;
    }

    const sheetDir = path.join(QR_ROOT, sheetName);
    await fs.mkdir(sheetDir, { recursive: true });

    let ok = 0, err = 0;
    const t0 = process.hrtime();
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const res   = await processBatch(batch, sheetDir);
      ok  += res.filter(r => r==='success').length;
      err += res.filter(r => r==='error').length;
      console.log(`✅ [${sheetName}] ${Math.min(i + BATCH_SIZE, data.length)}/${data.length}`);
    }
    const [s, ns] = process.hrtime(t0);
    console.log(`\n🎉 "${sheetName}" done: ${ok} OK, ${err} ERR in ${(s*1000 + ns/1e6).toFixed(1)}ms\n`);
  }

  // Archive at the end:
  await new Promise((resolve, reject) => {
    exec(`7z a -tzip ${FILE_PATH.replace('.xlsx', '')} qr`, (err, stdout, stderr) => {
      if (err) {
        console.error('❌ Archiving failed:', stderr);
        return reject(err);
      }
      console.log(`✅ Archive created: ${FILE_PATH.replace('.xlsx', '')}.zip`);
      resolve();
    });
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
