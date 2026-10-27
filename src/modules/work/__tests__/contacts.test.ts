import { contactFor } from "@/modules/work/contacts";

const roster = [
  { name: "Jamie Ortiz" },
  { name: "Wren Okafor" },
  { name: "Rosa De Leon" },
  { name: "Milo Strand" },
  { name: "Milo Brooks" },
];

describe("contactFor", () => {
  it("matches a whole name however it's written", () => {
    expect(contactFor("jamie  ORTIZ", roster)?.name).toBe("Jamie Ortiz");
    expect(contactFor("Rosa De Leon", roster)?.name).toBe("Rosa De Leon");
  });

  it("matches a first name and last initial, or a first initial and last name", () => {
    expect(contactFor("Wren O.", roster)?.name).toBe("Wren Okafor");
    expect(contactFor("J. Ortiz", roster)?.name).toBe("Jamie Ortiz");
    expect(contactFor("Rosa Leon", roster)?.name).toBe("Rosa De Leon");
  });

  it("matches a lone first name only when one person has it", () => {
    expect(contactFor("Wren", roster)?.name).toBe("Wren Okafor");
    expect(contactFor("Milo", roster)).toBeNull();
    expect(contactFor("Milo S", roster)?.name).toBe("Milo Strand");
  });

  it("matches nobody for no name or a stranger", () => {
    expect(contactFor(null, roster)).toBeNull();
    expect(contactFor("Taylor Brooks", roster)).toBeNull();
  });
});
