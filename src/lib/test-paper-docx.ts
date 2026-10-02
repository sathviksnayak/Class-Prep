import { deflateRawSync } from "node:zlib";
import type { PaperSection } from "./test-paper-generation";
import { calculateAttemptedMarks, formatMark } from "./mark-calculations.js";

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function paragraph(text: string, bold = false) {
  return `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function zip(files: Record<string, string>): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc32 = (buffer: Buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const locals: Buffer[] = []; const central: Buffer[] = []; let offset = 0; const entries = Object.entries(files);
  for (const [fileName, contents] of entries) {
    const name = Buffer.from(fileName); const raw = Buffer.from(contents, "utf8"); const compressed = deflateRawSync(raw); const crc = crc32(raw);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(compressed.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, name); offset += local.length + name.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

export function createGeneratedPaperDocx(paper: { title: string; sections: PaperSection[]; totalMarks: number }, includeAnswers = false) {
  const content = [paragraph(paper.title, true)];
  let number = 1;
  for (const section of paper.sections) {
    content.push(paragraph(section.implicit ? "Unsectioned" : section.name, true));
    for (const group of section.groups) {
      content.push(paragraph(`${group.label} — Answer any ${group.attempt} of the following ${group.offered} questions. Each carries ${formatMark(group.marksEach)} marks.`, true));
      for (const question of group.questions) {
        content.push(paragraph(`${number++}. ${question.text}`));
        question.options?.forEach((option, index) => content.push(paragraph(`   ${String.fromCharCode(65 + index)}. ${option}`)));
      }
    }
    content.push(paragraph(`Section total: ${formatMark(calculateAttemptedMarks(section.groups))} marks`, true));
  }
  content.push(paragraph(`Total marks: ${formatMark(paper.totalMarks)}`, true));
  if (includeAnswers) {
    content.push("<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>", paragraph("Answer Key", true));
    for (const section of paper.sections) for (const group of section.groups) for (const question of group.questions) {
      content.push(paragraph(`${question.text} — ${question.answer}${question.correctIndex === undefined ? "" : ` (correct option ${String.fromCharCode(65 + question.correctIndex)})`}`));
    }
  }
  const files = {
    "[Content_Types].xml": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>",
    "_rels/.rels": "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>",
    "word/document.xml": `<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>${content.join("")}<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/><w:pgMar w:top=\"1440\" w:right=\"1440\" w:bottom=\"1440\" w:left=\"1440\"/></w:sectPr></w:body></w:document>`,
  };
  const safeTitle = paper.title.replace(/[^a-z0-9-_ ]/gi, "").trim() || "test-paper";
  return { fileName: `${safeTitle}${includeAnswers ? "-with-answer-key" : ""}.docx`, buffer: zip(files) };
}
