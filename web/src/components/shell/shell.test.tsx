import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeModal, openDrawer, openModal, showToast, useDrawer, useModal, useToasts } from "@/state/ui";
import { Drawer } from "./Drawer";
import { ModalHost } from "./ModalHost";
import { ToastHost } from "./ToastHost";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

function Page() {
  return (
    <>
      <main data-app-chrome><button type="button">Opener</button></main>
      <ModalHost />
    </>
  );
}

beforeEach(() => {
  pathname = "/";
  useModal.setState({ current: null });
  useDrawer.setState({ open: false });
  useToasts.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

describe("pop-ups", () => {
  it("are labelled dialogs that take focus and make the page inert", () => {
    render(<Page />);
    const opener = screen.getByText("Opener");
    opener.focus();
    act(() => openModal(<><h3>Walk brief</h3><button type="button">Start shooting</button></>));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Walk brief");
    expect(screen.getByText("Start shooting")).toHaveFocus();
    expect(document.querySelector("main")!.inert).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("main")!.inert).toBe(false);
    expect(opener).toHaveFocus();
  });

  it("replacing a pop-up doesn't fire its onClose; closing does", () => {
    render(<Page />);
    const first = vi.fn(), second = vi.fn();
    act(() => openModal(<h3>Brief</h3>, { onClose: first }));
    act(() => openModal(<h3>Theme picker</h3>, { onClose: second }));
    expect(first).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Theme picker");
    act(() => closeModal());
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("close on the backdrop and the close button, but not on clicks inside", () => {
    render(<Page />);
    act(() => openModal(<p>Body</p>));
    fireEvent.click(screen.getByText("Body"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".modal-root")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => openModal(<p>Again</p>));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("close when the screen changes", () => {
    const { rerender } = render(<Page />);
    act(() => openModal(<p>Body</p>));
    pathname = "/album/";
    rerender(<Page />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("toasts", () => {
  it("show, then leave on their own after the duration", () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => { showToast("Walk resumed.", 1000); });
    expect(screen.getByRole("status")).toHaveTextContent("Walk resumed.");
    act(() => { vi.advanceTimersByTime(1000); }); // starts sliding out
    act(() => { vi.advanceTimersByTime(300); }); // then it's removed
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can be dismissed early", () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => { showToast("Hello"); });
    fireEvent.click(screen.getByLabelText("Dismiss"));
    act(() => { vi.advanceTimersByTime(300); });
    expect(useToasts.getState().toasts).toEqual([]);
  });
});

describe("drawer", () => {
  it("opens as a dialog, marks the current screen, and closes on Escape", () => {
    pathname = "/settings/";
    render(<Drawer />);
    expect(document.querySelector(".drawer-root")).toHaveClass("hidden");
    act(() => openDrawer());
    expect(document.querySelector(".drawer-root")).not.toHaveClass("hidden");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "My Themes" })).toHaveAttribute("href", "/themes");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useDrawer.getState().open).toBe(false);
  });
});
