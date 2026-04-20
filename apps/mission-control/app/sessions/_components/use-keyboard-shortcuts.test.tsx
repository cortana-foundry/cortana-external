import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

type Props = {
  enabled?: boolean;
  onFocusComposer?: () => void;
  onNextThread?: () => void;
  onPrevThread?: () => void;
};

function Harness({
  enabled = true,
  onFocusComposer = () => {},
  onNextThread = () => {},
  onPrevThread = () => {},
}: Props) {
  useKeyboardShortcuts({
    enabled,
    onFocusComposer,
    onNextThread,
    onPrevThread,
  });
  return <textarea data-testid="ta" />;
}

describe("useKeyboardShortcuts", () => {
  it("invokes onFocusComposer on '/' when focus is not an input", () => {
    const spy = vi.fn();
    render(<Harness onFocusComposer={spy} />);
    fireEvent.keyDown(window, { key: "/" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onFocusComposer when focus is in a textarea", () => {
    const spy = vi.fn();
    const { getByTestId } = render(<Harness onFocusComposer={spy} />);
    (getByTestId("ta") as HTMLTextAreaElement).focus();
    fireEvent.keyDown(window, { key: "/" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("invokes onNextThread on 'j' and onPrevThread on 'k'", () => {
    const next = vi.fn();
    const prev = vi.fn();
    render(<Harness onNextThread={next} onPrevThread={prev} />);
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "k" });
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledTimes(1);
  });

  it("does nothing when enabled=false", () => {
    const spy = vi.fn();
    render(<Harness enabled={false} onFocusComposer={spy} />);
    fireEvent.keyDown(window, { key: "/" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("ignores modifier-prefixed shortcuts", () => {
    const spy = vi.fn();
    render(<Harness onFocusComposer={spy} />);
    fireEvent.keyDown(window, { key: "/", metaKey: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it("removes its handler on unmount", () => {
    const spy = vi.fn();
    const { unmount } = render(<Harness onFocusComposer={spy} />);
    unmount();
    fireEvent.keyDown(window, { key: "/" });
    expect(spy).not.toHaveBeenCalled();
  });
});
