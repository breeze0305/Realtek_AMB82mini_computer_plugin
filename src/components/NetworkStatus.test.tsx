import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NetworkStatus } from "./NetworkStatus";

const copy = { online: "Online", offline: "Offline" };

describe("NetworkStatus", () => {
  it("renders the connected state", () => {
    render(<NetworkStatus internetConnected t={copy} />);

    expect(screen.getByText("Online")).toHaveClass("online");
  });

  it("renders the disconnected state", () => {
    render(<NetworkStatus internetConnected={false} t={copy} />);

    expect(screen.getByText("Offline")).toHaveClass("offline");
  });
});
