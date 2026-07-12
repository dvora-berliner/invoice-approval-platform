import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

describe("main entrypoint", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
  });

  it("mounts the App into #root", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    await import("../src/main");

    await waitFor(() => expect(root.querySelector("header h6")?.textContent).toBe("ApprovalFlow"));
  });
});
