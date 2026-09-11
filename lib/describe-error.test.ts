import { describe, expect, it } from "vitest";

import { describeError } from "@/lib/describe-error";

describe("describeError", () => {
  it("names an error and its code, never its message", () => {
    const error = Object.assign(new Error("connect to host.example failed"), { code: "P1001" });
    expect(describeError(error)).toBe("Error P1001");
  });

  it("names something thrown that is not an Error", () => {
    expect(describeError(new EventTarget())).toBe("[object EventTarget]");
    expect(describeError("host.example unreachable")).toBe("[object String]");
  });
});
