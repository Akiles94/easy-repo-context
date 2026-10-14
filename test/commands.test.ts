import { describe, expect, it } from "vitest";
import { justRecipes, makeTargets, roleOf } from "../src/commands.js";

describe("roleOf", () => {
  it.each([
    ["test", "test"],
    ["test:unit", "test"],
    ["test:watch", "other"],
    ["typecheck", "typecheck"],
    ["lint", "lint"],
    ["build", "build"],
    ["dev", "run"],
    ["release", "other"],
  ])("%s → %s", (name, role) => expect(roleOf(name)).toBe(role));
});

it("parses Makefile targets, skipping specials and variables", () => {
  const mk = ".PHONY: test\nCC := gcc\nVAR=1\nbuild: deps\n\tgo build\ntest:\n\tgo test ./...\n";
  expect(makeTargets(mk)).toEqual(["build", "test"]);
});

it("parses justfile recipes", () => {
  expect(justRecipes("set shell := [\"bash\"]\nbuild:\n  cargo build\ntest filter='': build\n  cargo test\n")).toEqual(["build", "test"]);
});
