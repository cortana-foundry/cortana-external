import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReplyComposer } from "./reply-composer";

describe("ReplyComposer", () => {
  it("updates via onChange", () => {
    const onChange = vi.fn();
    render(
      <ReplyComposer value="" onChange={onChange} onSubmit={() => {}} pending={false} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    expect(onChange).toHaveBeenCalledWith("hi");
  });

  it("submits on Cmd+Enter but not plain Enter", () => {
    const onSubmit = vi.fn();
    render(
      <ReplyComposer value="hi" onChange={() => {}} onSubmit={onSubmit} pending={false} />,
    );
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit when disabled via prop", () => {
    const onSubmit = vi.fn();
    render(
      <ReplyComposer value="hi" onChange={() => {}} onSubmit={onSubmit} pending={false} disabled />,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables the button when pending", () => {
    render(
      <ReplyComposer value="hi" onChange={() => {}} onSubmit={() => {}} pending />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows an error banner when provided", () => {
    render(
      <ReplyComposer
        value="hi"
        onChange={() => {}}
        onSubmit={() => {}}
        pending={false}
        error="Stream failed"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Stream failed");
  });

  it("registers and unregisters the textarea ref via onKeyboardRegister", () => {
    const register = vi.fn();
    const { unmount } = render(
      <ReplyComposer
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        pending={false}
        onKeyboardRegister={register}
      />,
    );
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0][0]).toBeInstanceOf(HTMLTextAreaElement);
    unmount();
    expect(register).toHaveBeenLastCalledWith(null);
  });
});
