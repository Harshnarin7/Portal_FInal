import { ERR_DIGITS, ERR_REQUIRED, ERR_SAME, mobilePairErrors } from "./mobileNumbers";

test("primary empty fails", () => {
  expect(mobilePairErrors("", "")).toEqual({ primary: ERR_REQUIRED, secondary: "" });
});

test("primary only passes", () => {
  expect(mobilePairErrors("9876543210", "")).toEqual({ primary: "", secondary: "" });
});

test("both valid passes", () => {
  expect(mobilePairErrors("9876543210", "9123456780")).toEqual({ primary: "", secondary: "" });
});

test("secondary invalid fails", () => {
  expect(mobilePairErrors("9876543210", "12345").secondary).toBe(ERR_DIGITS);
});

test("both the same fails", () => {
  expect(mobilePairErrors("9876543210", "9876543210").secondary).toBe(ERR_SAME);
});
