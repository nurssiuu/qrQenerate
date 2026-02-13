// generate_qr_with_bg_pdf.js

// ─── IMPORTS & SETUP ────────────────────────────────────────────────────────────
const fs = require("fs");
const fsp = require("fs").promises;
const nodeCanvas = require("canvas");
const { JSDOM } = require("jsdom");
const { QRCodeStyling } = require("qr-code-styling/lib/qr-code-styling.common.js");
const xlsx = require("xlsx");
const path = require("path");

// ─── CONFIGURATION ──────────────────────────────────────────────────────────────
const FILE_PATH = path.resolve(__dirname, "ИгровыеАппараты2509.xlsx");
const QR_TEMP_DIR = path.resolve(__dirname, "qr_temp");          // still useful for debugging
const OUTPUT_DIR = path.resolve(__dirname, "final_qr_images");    // now will contain PDFs
const BACKGROUND_IMAGE_PATH = path.resolve(__dirname, "Untitled(1).png");
const LOGO_PATH = path.resolve(__dirname, "logo.png");
const QR_SIZE = 1900;

nodeCanvas.registerFont(
  path.resolve(__dirname, "fonts", "montserrat-v30-cyrillic_latin-700.ttf"),
  { family: "Montserrat", weight: "700" }
);

// Ensure necessary directories exist
Promise.all([
  fsp.mkdir(QR_TEMP_DIR, { recursive: true }),
  fsp.mkdir(OUTPUT_DIR, { recursive: true }),
]).catch((err) => console.error("Directory creation error:", err));

// ─── FUNCTION: Read Excel Data ──────────────────────────────────────────────────
/**
 * Returns array of rows as-is (AoA). Adjust filtering if needed.
 * Current expected row order per usage: [qrLink, cashier, merchant, branch]
 */
function readExcelData(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  // If your sheet has a header row, you may want to slice(1)
  return rows.filter((r) => Array.isArray(r) && r.length >= 4 && r[0] && r[3]);
}

// ─── FUNCTION: Generate QR (transparent PNG buffer) ─────────────────────────────
async function generateQrBuffer(qrText, logoPath) {
  const qrCode = new QRCodeStyling({
    version: 4,
    quietZone: 4,
    jsdom: JSDOM,
    nodeCanvas,
    width: QR_SIZE,
    height: QR_SIZE,
    data: qrText,
    image: logoPath && fs.existsSync(logoPath) ? logoPath : null,
    imageOptions: { imageSize: 0.22 },
    dotsOptions: {
      gradient: {
        type: "linear",
        colorStops: [
          { offset: 0, color: "#10a55a" },
          { offset: 1, color: "#13818a" },
        ],
        rotation: Math.PI / 2,
      },
      type: "rounded",
    },
    cornersSquareOptions: { type: "square" },
    cornersDotOptions: { type: "square" },
    backgroundOptions: { color: "transparent" },
  });

  // Returns a PNG buffer; we’ll draw it onto a PDF canvas.
  return await qrCode.getRawData("png");
}

// ─── FUNCTION: Composite QR onto a PDF page ─────────────────────────────────────
/**
 * Creates a one-page PDF sized to the background image, draws the BG,
 * draws the QR centered, adds a title, then writes to outPath (.pdf).
 */
async function compositeQrOnBackgroundToPDF(qrBuffer, backgroundPath, outPath, name) {
  // Load background
  let bgImage;
  try {
    bgImage = await nodeCanvas.loadImage(backgroundPath);
  } catch (err) {
    console.error(`❌ Could not load background "${backgroundPath}"`, err);
    throw err;
  }

  // Create a PDF canvas with the background size (1 px ≈ 1 pt here)
  const canvas = nodeCanvas.createCanvas(bgImage.width, bgImage.height, "pdf");
  const ctx = canvas.getContext("2d");

  // Draw background
  ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height);

  // Load QR image from buffer
  let qrImage;
  try {
    qrImage = await nodeCanvas.loadImage(qrBuffer);
  } catch (err) {
    console.error("❌ Could not load QR buffer as image", err);
    throw err;
  }

  // Center the QR (same offsets you used, tweak as needed)
  const x = Math.floor((bgImage.width - qrImage.width) / 2) - 20;
  const y = Math.floor((bgImage.height - qrImage.height) / 2) + 130;
  ctx.drawImage(qrImage, x, y, qrImage.width + 40, qrImage.height + 40);

  // Add text (uses embedded Montserrat)
  ctx.font = '700 200px Arial';
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const textX = bgImage.width / 2 + 300;
  const textY = bgImage.height - 350;
  ctx.fillText(String(name || ""), textX, textY);

  // Write the PDF
  await new Promise((resolve, reject) => {
    const outStream = fs.createWriteStream(outPath);
    outStream.on("finish", resolve).on("error", reject);
    canvas.createPDFStream().pipe(outStream);
  });
}

// ─── MAIN: Process Excel Rows -> Write PDFs ─────────────────────────────────────
async function generateFromExcel() {
  const rows = readExcelData(FILE_PATH);
  if (!rows.length) {
    console.error("❌ No valid rows found in the Excel file.");
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const startTime = process.hrtime();

  for (let i = 0; i < rows.length; i++) {
    const [qrLink, cashier, merchant, branch] = rows[i];

    // Adjust branch name formatting as you had before
    const newBranchName = String(branch)
      .split("-")
      .map((s) => s.trim())
      .reverse()
      .join(" - ");

    // Use PDF extension now
    const baseName = [newBranchName, cashier]
      .join(" --- ")
      .replace(/[\/\\?%*:|"<>]/g, "-");
    const tempFile = path.join(QR_TEMP_DIR, `${baseName}_qr.png`);
    const finalFile = path.join(OUTPUT_DIR, `${baseName}.pdf`);

    try {
      const qrBuffer = await generateQrBuffer(
        String(qrLink),
        fs.existsSync(LOGO_PATH) ? LOGO_PATH : null
      );

      // Optional: keep raw QR PNG for debugging
      await fsp.writeFile(tempFile, qrBuffer);

      // Compose into a single-page PDF
      await compositeQrOnBackgroundToPDF(
        qrBuffer,
        BACKGROUND_IMAGE_PATH,
        finalFile,
        newBranchName.split(" - ")[0]
      );

      successCount++;
      console.log(`✅ [${i + 1}/${rows.length}] Saved PDF: ${finalFile}`);
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
