/** A book read from a file, ready to add to the library. */
export type ImportedBook = {
  title: string;
  author?: string;
  chapters: { title: string; text: string }[];
};

/** A problem with the file itself, worded for the reader. */
export class ImportError extends Error {}

/** Sections shorter than this are covers, title pages, copyright notices, or illustrations. */
export const MIN_SECTION_CHARS = 200;
