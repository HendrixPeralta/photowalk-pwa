import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountUser } from "@/lib/authApi";
import { allImageIds, putImage } from "@/lib/db";
import { ACCOUNT_KEY, OWNER_KEY, resolveAccount, signOut, useAccount, wipeLocalData } from "./account";
import { getData, STATE_KEY, update, useAppStore } from "./appStore";
import { defaultState } from "./defaults";
import { PRE_DEMO_KEY } from "./demo";
import { useToasts } from "./ui";

const reloadPage = vi.fn();
vi.mock("@/lib/page", () => ({ reloadPage: () => reloadPage() }));

const AKI: AccountUser = { id: "u-aki", name: "Aki", email: "aki@example.com", image: null };
const BEN: AccountUser = { id: "u-ben", name: "Ben", email: "ben@example.com", image: null };

/** The server's answers, in order; "down" stands for a network failure. */
function serverSays(...answers: (AccountUser | null | "down" | number)[]) {
  const fetchMock = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift()! : answers[0];
    if (next === "down") throw new TypeError("Failed to fetch");
    if (typeof next === "number") return new Response("{}", { status: next });
    return Response.json(next ? { user: next, session: {} } : null);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const remember = (user: AccountUser) => {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
  localStorage.setItem(OWNER_KEY, user.id);
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState(defaultState(), true);
  useAccount.setState({ user: null, status: "signed-in" }, true);
  useToasts.setState({ toasts: [] });
  reloadPage.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("resolveAccount", () => {
  it("asks for sign-in when nobody is remembered and the server knows no one", async () => {
    serverSays(null);
    expect(await resolveAccount()).toBe("sign-in");
  });

  it("says the server is out of reach rather than asking for a sign-in that can't work", async () => {
    serverSays("down");
    expect(await resolveAccount()).toBe("unreachable");
    serverSays(503);
    expect(await resolveAccount()).toBe("unreachable");
  });

  it("remembers whoever the server says is signed in, and their data becomes theirs", async () => {
    update((d) => { d.profile.walksCompleted = 4; });
    serverSays(AKI);
    expect(await resolveAccount()).toBe("app");
    expect(useAccount.getState().user).toEqual(AKI);
    expect(JSON.parse(localStorage.getItem(ACCOUNT_KEY)!)).toEqual(AKI);
    expect(localStorage.getItem(OWNER_KEY)).toBe(AKI.id);
    expect(getData().profile.walksCompleted).toBe(4);
  });

  it("opens straight away for a remembered person, even offline", async () => {
    remember(AKI);
    const fetchMock = serverSays("down");
    expect(await resolveAccount()).toBe("app");
    expect(useAccount.getState().user).toEqual(AKI);
    await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useAccount.getState().status).toBe("signed-in");
    expect(useToasts.getState().toasts).toEqual([]);
  });

  it("picks up a new name from the background check", async () => {
    remember(AKI);
    serverSays({ ...AKI, name: "Aki T." });
    await resolveAccount();
    await flush();
    expect(useAccount.getState().user?.name).toBe("Aki T.");
  });

  it("keeps going when the session has ended, but says so and forgets the person for next time", async () => {
    remember(AKI);
    serverSays(null);
    expect(await resolveAccount()).toBe("app");
    await flush();
    expect(useAccount.getState().status).toBe("expired");
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(useToasts.getState().toasts[0]).toMatchObject({ message: "Your session ended. Sign in again.", action: { label: "Sign in" } });
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("wipes the device before someone else's data can be seen", async () => {
    localStorage.setItem(OWNER_KEY, AKI.id);
    update((d) => { d.profile.walksCompleted = 9; });
    await putImage("aki-photo", new Blob(["x"]));
    serverSays(BEN);
    expect(await resolveAccount()).toBe("app");
    expect(getData().profile.walksCompleted).toBe(0);
    expect(await allImageIds()).toEqual([]);
    expect(localStorage.getItem(OWNER_KEY)).toBe(BEN.id);
  });

  it("starts over when another tab has signed in as someone else", async () => {
    remember(AKI);
    update((d) => { d.profile.walksCompleted = 9; });
    serverSays(BEN);
    expect(await resolveAccount()).toBe("app");
    await flush();
    await flush();
    expect(getData().profile.walksCompleted).toBe(0);
    expect(localStorage.getItem(OWNER_KEY)).toBe(BEN.id);
    expect(reloadPage).toHaveBeenCalledOnce();
  });
});

describe("signOut", () => {
  it("ends the session, forgets the person and keeps the device's data", async () => {
    remember(AKI);
    update((d) => { d.profile.walksCompleted = 4; });
    const fetchMock = serverSays(null);
    await signOut();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out/", expect.objectContaining({ method: "POST" }));
    expect(localStorage.getItem(ACCOUNT_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_KEY)).toBe(AKI.id);
    expect(getData().profile.walksCompleted).toBe(4);
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("refuses offline, where the server would never hear of it", async () => {
    remember(AKI);
    const fetchMock = serverSays(null);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await signOut();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ACCOUNT_KEY)).not.toBeNull();
    expect(useToasts.getState().toasts[0].message).toBe("Connect to the internet to sign out.");
    vi.restoreAllMocks();
  });

  it("stays signed in when the server didn't take it", async () => {
    remember(AKI);
    serverSays("down");
    await signOut();
    expect(localStorage.getItem(ACCOUNT_KEY)).not.toBeNull();
    expect(reloadPage).not.toHaveBeenCalled();
  });
});

describe("wipeLocalData", () => {
  it("removes everything personal and keeps the language and pending reviews", async () => {
    localStorage.setItem(STATE_KEY, "{}");
    localStorage.setItem(PRE_DEMO_KEY, "{}");
    localStorage.setItem("photoeye-lang", "ja");
    localStorage.setItem("photowalk:review-queue", "[]");
    await putImage("p1", new Blob(["x"]));
    await wipeLocalData();
    expect(localStorage.getItem(PRE_DEMO_KEY)).toBeNull();
    expect(localStorage.getItem("photoeye-lang")).toBe("ja");
    expect(localStorage.getItem("photowalk:review-queue")).toBe("[]");
    expect(await allImageIds()).toEqual([]);
    expect(getData()).toEqual(defaultState());
  });
});
