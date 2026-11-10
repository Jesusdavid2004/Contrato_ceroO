import PDFDocument from 'pdfkit';
import type { PdfGenerator, PdfReportSection } from '../../domain/services/InfrastructureInterfaces';

const FONT_SIZE = 11;
const HEADING_SIZE = 14;
const PAGE_MARGIN = 64;
const LINE_GAP = 4;

export class PdfKitGenerator implements PdfGenerator {
  public async generateObjectionLetterPdf(
    letterText: string,
    metadata: { title: string; locale: string },
  ): Promise<Buffer> {
    const documentTitle = metadata.locale.toLowerCase().startsWith('es')
      ? 'Carta de objeción'
      : 'Objection letter';
    const doc = new PDFDocument({
      autoFirstPage: true,
      margin: PAGE_MARGIN,
      info: {
        Title: `${documentTitle} - ${metadata.title}`,
        Subject: documentTitle,
      },
    });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.once('error', reject);
      doc.once('end', () => resolve(Buffer.concat(chunks)));

      doc
        .font('Helvetica')
        .fontSize(FONT_SIZE)
        .text(letterText, {
          align: 'left',
          lineGap: LINE_GAP,
          paragraphGap: LINE_GAP,
        });
      doc.end();
    });
  }

  public async generateCaseReportPdf(title: string, sections: PdfReportSection[]): Promise<Buffer> {
    const doc = new PDFDocument({
      autoFirstPage: true,
      margin: PAGE_MARGIN,
      info: { Title: title, Subject: title },
    });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.once('error', reject);
      doc.once('end', () => resolve(Buffer.concat(chunks)));

      doc.font('Helvetica-Bold').fontSize(HEADING_SIZE).text(title, { paragraphGap: LINE_GAP * 2 });
      for (const section of sections) {
        doc.font('Helvetica-Bold').fontSize(FONT_SIZE).text(section.heading, { paragraphGap: LINE_GAP });
        doc.font('Helvetica').fontSize(FONT_SIZE);
        for (const paragraph of section.body) {
          doc.text(paragraph, { align: 'left', lineGap: LINE_GAP, paragraphGap: LINE_GAP });
        }
      }
      doc.end();
    });
  }
}
