// RFC 4180 CSV parsing: quoted fields, "" escapes, commas and line breaks inside quotes,
// CRLF or LF line endings, and the UTF-8 byte-order mark Excel adds. No dependency needed.

export class CsvSyntaxError extends Error {
  constructor(readonly line: number, message: string) {
    super(message);
  }
}

/** Parses CSV text into rows of raw string cells. Fully blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let quoteStartLine = 1;

  const endRow = () => {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    cell = "";
  };

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell.trim() !== "") throw new CsvSyntaxError(line, `Line ${line}: a quote may only start a field.`);
      cell = "";
      quoted = true;
      quoteStartLine = line;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      endRow();
      line++;
    } else {
      cell += char;
    }
  }
  if (quoted) throw new CsvSyntaxError(quoteStartLine, `Line ${quoteStartLine}: a quoted field is never closed.`);
  if (cell !== "" || row.length) endRow();
  return rows;
}

/** Quotes a value for CSV output when needed. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
