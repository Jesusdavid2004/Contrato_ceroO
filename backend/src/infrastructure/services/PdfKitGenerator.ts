import PDFDocument from 'pdfkit';
import type { PdfGenerator } from '../../domain/services/InfrastructureInterfaces';

const FONT_SIZE = 11;
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
}
