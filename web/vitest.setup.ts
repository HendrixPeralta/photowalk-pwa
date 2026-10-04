import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { beforeEach } from "vitest";
import { configureI18n } from "@/lib/i18n/core";

// Every test starts in English. Tests that need Japanese call
// configureI18n("ja", ja) themselves.
beforeEach(() => configureI18n("en"));
