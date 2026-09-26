/**
 * Zero-dependency, lightweight standard PDF 1.4 generator for payment receipts.
 * Produces clean, professional vector PDFs using standard Type 1 fonts (Helvetica, Helvetica-Bold).
 */

function escapePdfText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function generateReceiptPdfBuffer(receipt) {
  const isPO = Boolean(receipt.procurementOrderId);
  const streamLines = [];

  // Stream utility helpers
  const addText = (text, x, y, size = 10, font = 'F1', r = 0.1, g = 0.1, b = 0.1) => {
    streamLines.push(
      `BT /${font} ${size} Tf ${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`
    );
  };

  const addLine = (x1, y1, x2, y2, r = 0.8, g = 0.8, b = 0.8, width = 1) => {
    streamLines.push(
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`
    );
  };

  const addRect = (x, y, w, h, r = 0.95, g = 0.95, b = 0.97, stroke = false) => {
    streamLines.push(
      `${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} rg ${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}`
    );
  };

  // 1. Page Header Background
  addRect(0, 750, 612, 92, 0.96, 0.97, 1.0);
  addLine(0, 750, 612, 750, 0.85, 0.88, 0.95, 1.5);

  // Logo / Brand
  addText('INDULGE', 40, 800, 20, 'F2', 0.18, 0.22, 0.45);
  addText('B2B Hospitality Resource Exchange', 40, 782, 10, 'F1', 0.4, 0.45, 0.55);

  // Watermark Notice Box (Visible Demo / Simulated notice)
  addRect(350, 770, 222, 38, 0.99, 0.92, 0.85, false);
  addText('DEMO / SIMULATED PAYMENT RECEIPT', 360, 792, 9, 'F2', 0.75, 0.35, 0.05);
  addText('Not a GST Tax Invoice', 360, 778, 8, 'F1', 0.65, 0.3, 0.05);

  // 2. Receipt Identification
  let curY = 710;
  addText('RECEIPT DETAILS', 40, curY, 12, 'F2', 0.15, 0.15, 0.2);
  curY -= 20;

  addText(`Receipt Number: ${receipt.receiptNumber || 'N/A'}`, 40, curY, 10, 'F1');
  addText(`Date: ${new Date(receipt.paymentTimestamp || Date.now()).toLocaleDateString('en-IN')}`, 350, curY, 10, 'F1');
  curY -= 16;

  if (isPO) {
    addText(`Procurement Order: #${receipt.orderNumber || receipt.procurementOrderId}`, 40, curY, 10, 'F1');
  } else {
    addText(`Transaction ID: ${receipt.transactionId}`, 40, curY, 10, 'F1');
    addText(`Booking Ref: ${receipt.bookingNumber || receipt.bookingId || 'N/A'}`, 350, curY, 10, 'F1');
  }
  curY -= 16;
  addText(`Payment Status: ${String(receipt.paymentStatus).toUpperCase()}`, 40, curY, 10, 'F2', 0.05, 0.55, 0.25);
  addText(`Payment Method: ${receipt.paymentMethod || 'Simulated Transfer'}`, 350, curY, 10, 'F1');
  curY -= 25;

  addLine(40, curY, 572, curY, 0.88, 0.88, 0.9);
  curY -= 25;

  // 3. Parties Section
  addText('PARTIES', 40, curY, 12, 'F2', 0.15, 0.15, 0.2);
  curY -= 20;

  addText('Payer (Seeker):', 40, curY, 10, 'F2');
  addText('Recipient (Provider):', 320, curY, 10, 'F2');
  curY -= 16;

  addText(receipt.payerBusiness?.name || 'Authorized Buyer', 40, curY, 10, 'F1');
  if (isPO && !receipt.isIndividualProviderView) {
    addText('Multi-Provider Grouped Allocation', 320, curY, 10, 'F1');
  } else {
    addText(receipt.providerBusiness?.name || 'Authorized Provider', 320, curY, 10, 'F1');
  }
  curY -= 30;

  addLine(40, curY, 572, curY, 0.88, 0.88, 0.9);
  curY -= 25;

  // 4. Line Items / Settlement Table
  addText('ALLOCATION & SETTLEMENT', 40, curY, 12, 'F2', 0.15, 0.15, 0.2);
  curY -= 20;

  // Table Header Box
  addRect(40, curY - 5, 532, 22, 0.93, 0.94, 0.96);
  addText('Item / Allocation', 50, curY + 2, 9, 'F2');
  addText('Units', 380, curY + 2, 9, 'F2');
  addText('Amount (INR)', 470, curY + 2, 9, 'F2');
  curY -= 24;

  if (isPO && !receipt.isIndividualProviderView && Array.isArray(receipt.providers)) {
    receipt.providers.forEach((p) => {
      addText(`${p.providerName} - ${p.resourceTitle}`, 50, curY, 9, 'F1');
      addText(`${p.quantity}`, 390, curY, 9, 'F1');
      addText(`INR ${Number(p.amount).toLocaleString('en-IN')}`, 470, curY, 9, 'F1');
      curY -= 18;
    });
  } else {
    const itemTitle = receipt.resource?.title || receipt.allocation?.resourceTitle || 'Hospitality Resource Service';
    const qty = receipt.quantity || receipt.allocation?.quantity || 1;
    const amt = receipt.amount || receipt.totalAmount || 0;

    addText(itemTitle, 50, curY, 9, 'F1');
    addText(`${qty}`, 390, curY, 9, 'F1');
    addText(`INR ${Number(amt).toLocaleString('en-IN')}`, 470, curY, 9, 'F1');
    curY -= 18;
  }

  curY -= 10;
  addLine(40, curY, 572, curY, 0.8, 0.8, 0.85);
  curY -= 22;

  // Total
  const totalAmt = receipt.totalAmount || receipt.amount || 0;
  addText('TOTAL SETTLED (SIMULATED):', 300, curY, 11, 'F2');
  addText(`INR ${Number(totalAmt).toLocaleString('en-IN')}`, 470, curY, 12, 'F2', 0.1, 0.45, 0.2);
  curY -= 35;

  // 5. Legal / Simulated Notice Disclaimer
  addRect(40, curY - 30, 532, 45, 0.97, 0.97, 0.98, true);
  addText('IMPORTANT NOTICE: DEMO / SIMULATION ENVIRONMENT', 50, curY - 2, 8, 'F2', 0.5, 0.3, 0.1);
  addText(
    'This simulated payment receipt is issued strictly for hackathon, demonstration, and evaluation testing.',
    50,
    curY - 14,
    7.5,
    'F1',
    0.4,
    0.4,
    0.4
  );
  addText(
    'It does not constitute a GST tax invoice, credit note, or commercial settlement certificate.',
    50,
    curY - 24,
    7.5,
    'F1',
    0.4,
    0.4,
    0.4
  );

  // Assemble Standard PDF Document Structure
  const contentStream = streamLines.join('\n');
  const streamLength = Buffer.byteLength(contentStream, 'utf-8');

  const pdfParts = [
    '%PDF-1.4\n',
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  // Calculate cross reference offsets
  let offset = 0;
  const xref = ['xref\n0 7\n0000000000 65535 f \n'];
  const objects = pdfParts.slice(1);

  offset = Buffer.byteLength(pdfParts[0], 'utf-8');
  for (let i = 0; i < objects.length; i++) {
    const formattedOffset = String(offset).padStart(10, '0');
    xref.push(`${formattedOffset} 00000 n \n`);
    offset += Buffer.byteLength(objects[i], 'utf-8');
  }

  const startxref = offset;
  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  const finalPdf = Buffer.concat([
    Buffer.from(pdfParts.join(''), 'utf-8'),
    Buffer.from(xref.join(''), 'utf-8'),
    Buffer.from(trailer, 'utf-8'),
  ]);

  return finalPdf;
}
