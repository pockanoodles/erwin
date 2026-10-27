/**
 * Which of a job's contacts a schedule means when it names a supervisor.
 * Schedules write names loosely ("jamie ortiz", "Jamie O.", "J. Ortiz",
 * "Jamie"), so a name matches the contact with that whole name, or else the
 * one contact its parts fit: first name and last initial, first initial and
 * last name, first and last with any middle name skipped, or a lone first
 * name. A name that could be two people matches nobody.
 */

const clean = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

export function contactFor<T extends { name: string }>(
  name: string | null,
  contacts: readonly T[]
): T | null {
  if (!name) return null;
  const words = clean(name);
  if (words.length === 0) return null;
  const whole = words.join(" ");
  const exact = contacts.filter((c) => clean(c.name).join(" ") === whole);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : null;
  const unique = (fits: (w: string[]) => boolean) => {
    const found = contacts.filter((c) => fits(clean(c.name)));
    return found.length === 1 ? found[0] : null;
  };
  if (!last) return unique((w) => w[0] === first);
  return unique((w) => {
    if (w.length < 2) return false;
    const [theirFirst, theirLast] = [w[0], w[w.length - 1]];
    if (last.length === 1) return theirFirst === first && theirLast[0] === last;
    if (first.length === 1)
      return theirFirst[0] === first && theirLast === last;
    return theirFirst === first && theirLast === last;
  });
}
