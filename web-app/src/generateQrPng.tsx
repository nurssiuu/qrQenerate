// import QRCodeStyling from "qr-code-styling";

// export default async function generateQrPng(data: string, centerImageUrl?: string) {
//   const qr = new QRCodeStyling({
//     width: 2000,
//     height: 2000,
//     data,
//     dotsOptions: {
//       type: "rounded",
//       gradient: {
//         type: "linear",
//         rotation: 1.5708,
//         colorStops: [
//           { offset: 0, color: "#12944C" },
//           { offset: 1, color: "#1E6E72" },
//         ],
//       },
//     },
//     cornersSquareOptions: { type: "extra-rounded" },
//     cornersDotOptions: { type: "extra-rounded" },
//     backgroundOptions: { color: "#ffffff00" },
//     image: centerImageUrl || Mlogo,
//     imageOptions: { crossOrigin: "anonymous", margin: 20, imageSize: 0.28 },
//   });
//   const blob = await qr.getRawData("png");
//   return blob as Blob;
// };