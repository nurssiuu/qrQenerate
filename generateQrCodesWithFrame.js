// generate_qr_with_bg.js

// ─── IMPORTS & SETUP ────────────────────────────────────────────────────────────
// 1) Core 'fs' for synchronous checks & createWriteStream
const fs = require("fs");
// 2) Promise-based 'fs.promises' for async ops (mkdir, etc.)
const fsp = require("fs").promises;
// 3) node-canvas for compositing: createCanvas, loadImage
const nodeCanvas = require('canvas');
// 4) jsdom for minimal DOM (required by qr-code-styling)
const { JSDOM } = require("jsdom");
// 5) QRCodeStyling for QR generation
const {QRCodeStyling} = require("qr-code-styling/lib/qr-code-styling.common.js");
// 6) SheetJS (xlsx) for reading Excel files
const xlsx = require("xlsx");
// 7) Path utility for file/directory paths
const path = require("path");

// ─── CONFIGURATION ──────────────────────────────────────────────────────────────
// Path to your Excel file
const FILE_PATH = path.resolve(__dirname, "ИгровыеАппараты2509.xlsx");
// Directory where individual QR PNGs (before compositing) are saved temporarily
const QR_TEMP_DIR = path.resolve(__dirname, "qr_temp");
// Directory where final composed PNGs (with background) will be placed
const OUTPUT_DIR = path.resolve(__dirname, "final_qr_images");
// Full-bleed background image (PNG or JPG) to place behind each QR
const BACKGROUND_IMAGE_PATH = path.resolve(__dirname, "Untitled(1).png");
// (Optional) Center logo for embedding within the QR (PNG)
const LOGO_PATH = path.resolve(__dirname, "logo.png");
// Dimensions for each QR code (square, in pixels)
const QR_SIZE = 1900;

nodeCanvas.registerFont(path.resolve(__dirname, "fonts", "montserrat-v30-cyrillic_latin-700.ttf"), {
    family: "Montserrat",
    weight: "700",
  });

// Ensure necessary directories exist (create if missing)
Promise.all([
  fsp.mkdir(QR_TEMP_DIR, { recursive: true }),
  fsp.mkdir(OUTPUT_DIR, { recursive: true }),
]).catch((err) => console.error("Directory creation error:", err));  // :contentReference[oaicite:10]{index=10}

// ─── FUNCTION: Read & Filter Excel Data ──────────────────────────────────────────
/**
 * Reads the workbook at filePath and returns an array of valid rows.
 * Each row is [ID, Name, Other, QR_Link, Login, Password].
 * Filters out any row missing Name, QR_Link, Login, or Password.
 */
function readExcelData(filePath) {
  // 1) Load the workbook synchronously (SheetJS returns a workbook object)
  const workbook = xlsx.readFile(filePath);  // 
  // 2) Use the first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  // 3) Convert sheet → array-of-arrays (header:1 = raw rows)
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });  // 

  // 4) Keep rows where columns [1]=Name, [3]=QR_Link, [4]=Login, [5]=Password exist
  return rows
}

// ─── FUNCTION: Generate QR with Transparent Background ──────────────────────────
/**
 * Creates a QRCodeStyling instance with a transparent background and optional logo,
 * then returns a Promise<Buffer> containing the PNG bytes.
 *
 * @param {string} qrText – The string/URL to encode.
 * @param {string|null} logoPath – Path to a center logo PNG, or null for none.
 * @returns {Promise<Buffer>} – PNG buffer (transparent background).
 */
async function generateQrBuffer(qrText, logoPath) {
  // 1) Instantiate QRCodeStyling with transparent background
  const qrCode = new QRCodeStyling({
    version: 4,
    quietZone: 4,
    jsdom: JSDOM,           // Provide a DOM shim in Node :contentReference[oaicite:14]{index=14}
    nodeCanvas, // Canvas constructor from node-canvas :contentReference[oaicite:15]{index=15}
    width: QR_SIZE,
    height: QR_SIZE,
    data: qrText,           // The string or URL to encode
    image: logoPath && fs.existsSync(logoPath) ? logoPath : null,  // Embed logo only if it exists :contentReference[oaicite:16]{index=16}
    imageOptions: {
        imageSize: 0.22,
    },
    dotsOptions: {
        gradient: {
            type: "linear",
            colorStops: [
                { offset: 0, color: "#10a55a" },
                { offset: 1, color: "#13818a" }
            ],
            rotation: 1.5707963268,
        },
        type: "rounded"
    },
    cornersSquareOptions: { type: "square" },
    cornersDotOptions: { type: "square" },
    backgroundOptions: { 
        color: "transparent",
    },
  });

  // 2) Export as a PNG buffer by passing "png" (string) to getRawData
  const pngBuffer = await qrCode.getRawData("png");  // 
  return pngBuffer;
}

// ─── FUNCTION: Composite QR Buffer Over Background ─────────────────────────────
/**
 * Draws the QR PNG buffer centered on top of a full-bleed background image,
 * then writes the final PNG to outPath.
 *
 * @param {Buffer} qrBuffer – PNG bytes of QR (transparent background).
 * @param {string} backgroundPath – Path to full-bleed background image (PNG/JPG).
 * @param {string} outPath – Path to save the composite PNG.
 */
async function compositeQrOnBackground(qrBuffer, backgroundPath, outPath, name) {
  // 1) Load the background image into an Image object
  let bgImage;
  try {
    bgImage = await nodeCanvas.loadImage(backgroundPath);  // :contentReference[oaicite:19]{index=19}
  } catch (err) {
    console.error(`❌ Could not load background "${backgroundPath}"`, err);
    throw err;
  }

  // 2) Create a canvas matching the background’s dimensions
  const canvas = nodeCanvas.createCanvas(bgImage.width, bgImage.height);
  const ctx = canvas.getContext("2d");

  // 3) DRAW BACKGROUND FIRST (so it sits behind the QR)
  ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height);

  // 4) Load the QR image from the buffer (transparent PNG)
  let qrImage;
  try {
    qrImage = await nodeCanvas.loadImage(qrBuffer);  // :contentReference[oaicite:21]{index=21}
  } catch (err) {
    console.error("❌ Could not load QR buffer as image", err);
    throw err;
  }

  // 5) Center the QR on the background
  const x = Math.floor((bgImage.width - qrImage.width) / 2) - 20;
  const y = Math.floor((bgImage.height - qrImage.height) / 2) + 130;
  ctx.drawImage(qrImage, x , y, qrImage.width + 40, qrImage.height + 40);

  ctx.font = "bold 200px Arial"; // set font size & family :contentReference[oaicite:25]{index=25}
  ctx.fillStyle = "#000000";         // text color (black) :contentReference[oaicite:26]{index=26}
  ctx.textAlign = "center";          // center text horizontally :contentReference[oaicite:27]{index=27}
  ctx.textBaseline = "top";          // y = top of text :contentReference[oaicite:28]{index=28}

  const textX = bgImage.width / 2 + 300;    
  const textY = bgImage.height - 350; // 25px gap under QR

  ctx.fillText(name, textX, textY)

  // 6) Stream out the final composite PNG to disk
  await new Promise((resolve, reject) => {
    const outStream = fs
      .createWriteStream(outPath)
      .on("finish", resolve)
      .on("error", reject);
    canvas.createPNGStream().pipe(outStream);  // 
  });
}

// ─── MAIN: Process Excel Rows & Save Final Images ───────────────────────────────
async function generateFromExcel() {
  // 1) Read & filter Excel rows
  const rows = readExcelData(FILE_PATH);
  if (!rows.length) {
    console.error("❌ No valid rows found in the Excel file.");
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const startTime = process.hrtime();

  // 2) Loop through each valid row
  for (let i = 0; i < rows.length; i++) {
    const [qrLink, cashier, merchant, branch] = rows[i];
    const newBranchName = branch.split('-').map(s => s.trim()).reverse().join(' - ');
    // 2a) Sanitize filename: "Name - login - password.png"
    const sanitized = [newBranchName, cashier].join(' --- ').replace(
      /[\/\\?%*:|"<>]/g,
      "-"
    );
    const tempFile = path.join(QR_TEMP_DIR, `${sanitized}_qr.png`);
    const finalFile = path.join(OUTPUT_DIR, `${sanitized}.png`);

    try {
      // 3) Generate QR buffer (transparent background, optional logo)
      const qrBuffer = await generateQrBuffer(
        qrLink,
        fs.existsSync(LOGO_PATH) ? LOGO_PATH : null
      );
      // 4) Optionally save the raw QR (if you ever need it):
      await fsp.writeFile(tempFile, qrBuffer);

      // 5) Composite QR over the background and save to finalFile
      await compositeQrOnBackground(qrBuffer, BACKGROUND_IMAGE_PATH, finalFile, newBranchName.split(' - ')[0]);

      successCount++;
      console.log(`✅ [${i + 1}/${rows.length}] Saved: ${finalFile}`);
    } catch (err) {
      errorCount++;
      console.error(`❌ [${i + 1}/${rows.length}] Failed on row ${i + 1}:`, err);
    }
  }

  const diff = process.hrtime(startTime);
  const elapsedMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);
  console.log(
    `\n📈 Completed: ${successCount} success, ${errorCount} failures (Elapsed ${elapsedMs} ms)`
  );
}

// Execute
generateFromExcel().catch((err) => console.error("Fatal error:", err));
