import QRCodeStyling from "qr-code-styling";
import jsPDF from "jspdf";

const QR_SIZE = 1900; // High res for print
// Actual dimensions will maintain bg aspect ratio.

export interface QrData {
    qrLink: string;
    cashier: string;
    merchant: string;
    branch: string;
}

export const generateQrBlob = async (qrText: string, logoUrl: string): Promise<Blob> => {
    const qrCode = new QRCodeStyling({
        width: QR_SIZE,
        height: QR_SIZE,
        data: qrText,
        image: logoUrl,
        dotsOptions: {
            color: "#10a55a", // Gradient not directly supported in simple config without extra step, but library supports it
            gradient: {
                type: "linear",
                rotation: Math.PI / 2,
                colorStops: [
                    { offset: 0, color: "#10a55a" },
                    { offset: 1, color: "#13818a" },
                ],
            },
            type: "rounded",
        },
        cornersSquareOptions: { type: "square" },
        cornersDotOptions: { type: "square" },
        backgroundOptions: { color: "transparent" },
        imageOptions: { crossOrigin: "anonymous", margin: 0, imageSize: 0.22 },
    });

    return await qrCode.getRawData("png") as Blob;
};

export const createCompositeImage = async (
    qrBlob: Blob,
    bgUrl: string,
    branchName: string
): Promise<string> => {
    // Load images
    const bgImg = await loadImage(bgUrl);
    const qrImg = await loadImage(URL.createObjectURL(qrBlob));

    // Canvas setup
    const canvas = document.createElement("canvas");
    canvas.width = bgImg.width;
    canvas.height = bgImg.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("Could not get canvas context");

    // Draw Background
    ctx.drawImage(bgImg, 0, 0);

    // Draw QR
    // Logic from original:
    // x = (bgWidth - qrWidth) / 2 - 20
    // y = (bgHeight - qrHeight) / 2 + 130
    // width = qrWidth + 40 ? No, logic was drawImage(qr, x, y, w+40, h+40)

    // The original script used a specific QR_SIZE of 1900.
    // The node-canvas logic:
    // const x = Math.floor((bgImage.width - qrImage.width) / 2) - 20;
    // const y = Math.floor((bgImage.height - qrImage.height) / 2) + 130;
    // ctx.drawImage(qrImage, x, y, qrImage.width + 40, qrImage.height + 40);

    // We should respect the QR_SIZE if the blob matches it, but let's calculate based on actual image dims
    const qrW = qrImg.width;
    const qrH = qrImg.height;

    const x = Math.floor((bgImg.width - qrW) / 2) - 20;
    const y = Math.floor((bgImg.height - qrH) / 2) + 130;

    ctx.drawImage(qrImg, x, y, qrW + 40, qrH + 40);

    // Draw Text
    // ctx.font = '700 200px Arial'; -> But we have Montserrat
    // We need to ensure the font is loaded in the DOM before drawing
    // document.fonts.ready.then(...) should be handled by caller or assumed loaded

    ctx.font = "700 200px 'Montserrat', Arial, sans-serif";
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const textX = bgImg.width / 2 + 300;
    const textY = bgImg.height - 350;

    ctx.fillText(branchName, textX, textY);

    return canvas.toDataURL("image/png");
};

export const generatePdf = (dataUrl: string, width: number, height: number): jsPDF => {
    // Create PDF with dimensions matching the image (converted to points/mm) or fit A4?
    // The original script created a PDF with size matching the background pixel size.
    // 1px = 1pt roughly in that script's context of "pdf" extraction? 
    // node-canvas 'pdf' backend uses 1 unit = 1 point = 1/72 inch.

    // jspdf default is mm.
    // Let's stick to pixel-based points if possible, or convert.
    // To match original exactly, we'd need to know the target print size.
    // Assuming the user just wants the image in a PDF container.

    const orientation = width > height ? "l" : "p";
    const pdf = new jsPDF({
        orientation,
        unit: "px",
        format: [width, height],
    });

    pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
    return pdf;
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
};
