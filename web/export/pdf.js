/* Minimal PDF 1.4 image document with byte accurate cross references. */
export function createImagePDF(jpeg, width, height) {
  if (!(jpeg instanceof Uint8Array) || jpeg[0] !== 255 || jpeg[1] !== 216) throw new Error('PDF image must be JPEG bytes.');
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 16384)) throw new Error('Invalid PDF dimensions.');
  const encoder = new TextEncoder();
  const chunks = [], offsets = [0]; let length = 0;
  const write = data => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(bytes); length += bytes.length; };
  const object = (id, content) => { offsets[id] = length; write(`${id} 0 obj\n${content}\nendobj\n`); };
  write('%PDF-1.4\n%Rash\n');
  const w = +(width * 0.75).toFixed(4), h = +(height * 0.75).toFixed(4);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  write(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  write(jpeg); write('\nendstream\nendobj\n');
  const commands = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
  object(5, `<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}endstream`);
  const xref = length;
  write('xref\n0 6\n0000000000 65535 f \n');
  for (let id = 1; id <= 5; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}
