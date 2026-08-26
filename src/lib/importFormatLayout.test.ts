import { HOME_IMPORT_FORMAT_ROWS } from './importFormatLayout';

const rows = HOME_IMPORT_FORMAT_ROWS.map((row) => row.join(','));
const expectedRows = ['PDF,DOCX,TXT,MD', 'HTML,RTF,EPUB'];

if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
  throw new Error('Import formats must remain arranged as four on top and three below');
}
