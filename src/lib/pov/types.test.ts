import { povHashKey, mergePov, validatePov } from "./types";

describe("povHashKey", () => {
  it("returns same hash regardless of entity order", () => {
    const a = povHashKey({ scenarioCode: "Actual", periodCode: "FY2026", entityCodes: ["IN_OPS","US_HQ"] });
    const b = povHashKey({ scenarioCode: "Actual", periodCode: "FY2026", entityCodes: ["US_HQ","IN_OPS"] });
    expect(a).toBe(b);
  });
  it("changes hash when scenario differs", () => {
    const a = povHashKey({ scenarioCode: "Actual", periodCode: "FY2026" });
    const b = povHashKey({ scenarioCode: "Budget", periodCode: "FY2026" });
    expect(a).not.toBe(b);
  });
});

describe("mergePov", () => {
  it("overrides only specified fields", () => {
    const r = mergePov(
      { scenarioCode: "Actual", periodCode: "FY2026", entityCodes: ["IN_OPS"] },
      { periodCode: "2026Q2" },
    );
    expect(r.scenarioCode).toBe("Actual");
    expect(r.periodCode).toBe("2026Q2");
    expect(r.entityCodes).toEqual(["IN_OPS"]);
  });
});

describe("validatePov", () => {
  it("returns null for a valid minimal POV", () => {
    expect(validatePov({ scenarioCode: "Actual", periodCode: "FY2026" })).toBeNull();
  });
  it("rejects missing scenario", () => {
    expect(validatePov({ periodCode: "FY2026" })).toMatch(/scenarioCode/);
  });
  it("rejects missing period", () => {
    expect(validatePov({ scenarioCode: "Actual" })).toMatch(/periodCode/);
  });
  it("rejects non-array entityCodes", () => {
    expect(validatePov({ scenarioCode: "Actual", periodCode: "FY2026", entityCodes: "IN_OPS" })).toMatch(/entityCodes/);
  });
});
