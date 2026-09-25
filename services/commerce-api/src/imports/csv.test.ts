import { describe, expect, it } from "vitest";
import { csvCell, CsvSyntaxError, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses plain rows with LF and CRLF endings and strips the BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("handles quotes, escaped quotes, commas and line breaks inside quotes", () => {
    expect(parseCsv('name,note\n"Towel, blue","He said ""soft""\nsecond line"')).toEqual([
      ["name", "note"],
      ["Towel, blue", 'He said "soft"\nsecond line'],
    ]);
  });

  it("keeps empty cells and drops fully blank lines", () => {
    expect(parseCsv("a,b,c\n1,,3\n\n,,\n4,5,")).toEqual([["a", "b", "c"], ["1", "", "3"], ["4", "5", ""]]);
  });

  it("reports an unclosed quote with its line number", () => {
    expect(() => parseCsv('a,b\n1,"never closed\n2,3')).toThrow(CsvSyntaxError);
    try {
      parseCsv('a,b\n1,"never closed');
    } catch (error) {
      expect((error as CsvSyntaxError).line).toBe(2);
    }
  });
});

describe("csvCell", () => {
  it("quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell(null)).toBe("");
  });
});
