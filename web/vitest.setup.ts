import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { configureI18n } from "@/lib/i18n/core";

// Every test starts in English. Tests that need Japanese call
// configureI18n("ja", ja) themselves.
beforeEach(() => configureI18n("en"));

// Testing Library only unmounts between tests by itself when Vitest globals
// are on; they aren't here.
afterEach(() => cleanup());
