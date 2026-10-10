import { describe, expect, it } from "vitest";
import { confirmationOutcome } from "../src/confirmation.js";

describe("write confirmation gate", () => {
  it("allows a write only for an accepted positive confirmation", () => {
    expect(confirmationOutcome(true, "accept")).toBe("confirmed");
  });

  it("does not treat a missing answer as approval", () => {
    expect(confirmationOutcome(undefined, undefined)).toBe("pending");
    expect(confirmationOutcome(true, undefined)).toBe("pending");
  });

  it("cancels on a negative answer or a declined elicitation", () => {
    expect(confirmationOutcome(false, "accept")).toBe("cancelled");
    expect(confirmationOutcome(undefined, "decline")).toBe("cancelled");
    expect(confirmationOutcome(undefined, "cancel")).toBe("cancelled");
  });
});
