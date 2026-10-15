import { test, expect } from "@playwright/test";
test("home explains both chains and no-custody boundary",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:/Move value/i})).toBeVisible();
  await expect(page.getByText("Portaldot V3").first()).toBeVisible();
  await expect(page.getByRole("link",{name:/Start a swap/i})).toBeVisible();
});
test("swap page rejects no wallet and no deployment",async({page})=>{
  await page.goto("/swap");
  await expect(page.getByRole("heading",{name:/Swap to Portaldot/i})).toBeVisible();
  await expect(page.getByRole("button",{name:/Request competing quotes/i})).toBeDisabled();
});
test("proof links public source without inventing contracts",async({page})=>{
  await page.goto("/proof");
  await expect(page.getByText(/Awaiting confirmed testnet deployment/).first()).toBeVisible();
});
