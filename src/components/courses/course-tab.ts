/** How a course is named on its sheet tab and in dense rows: its code, not Canvas's long title. */

/** Canvas course names carry section and term noise; the code is what's on the tab. */
export function courseTab(c: { code: string | null; name: string }): string {
  const code = c.code ?? c.name;
  return code.match(/^[A-Z]{2,5}\s?\d{4}/)?.[0].replace(/\s/, "") ?? code.slice(0, 16);
}
