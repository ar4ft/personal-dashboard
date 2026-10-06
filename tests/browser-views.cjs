/** Switch views through the same controls menu used by the embedded reader. */
async function showView(page, view) {
  const menu = page.locator("#reader-controls-open");
  if (await menu.isVisible()) {
    if (
      !(await page.locator("#reader-controls-dialog").evaluate((n) => n.open))
    )
      await menu.click();
  }
  await page.locator(`button[data-view="${view}"]`).click();
}
module.exports = { showView };
