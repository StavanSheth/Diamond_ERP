const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  console.log('Navigating to inventory...');
  await page.goto('http://localhost:5173/inventory', { waitUntil: 'networkidle0' });
  
  console.log('Clicking on WHITE STAR card...');
  await page.waitForSelector('h3'); // card title
  await page.click('h3'); 
  
  console.log('Waiting for ledger to load...');
  await page.waitForTimeout(2000);
  
  console.log('Clicking Add Transaction...');
  const addBtn = await page.$x("//button[contains(., 'Add Transaction')]");
  if (addBtn.length > 0) {
    await addBtn[0].click();
  } else {
    console.log('Add Transaction button not found');
    await browser.close();
    return;
  }
  
  await page.waitForTimeout(1000);
  
  console.log('Filling form...');
  // Fill weight
  await page.type('input[type="number"]', '3.5');
  
  // Select client (find the first select)
  const selects = await page.$$('select');
  // There are 3 selects: txnType, stockType, clientName, brokerName
  // We need to type into them or select. Let's just click Save and see if the ones we didn't fill are erased.
  
  console.log('Clicking Save...');
  const saveBtn = await page.$x("//button[contains(., 'Save')]");
  if (saveBtn.length > 0) {
    await saveBtn[0].click();
  }
  
  await page.waitForTimeout(3000);
  
  console.log('Checking table...');
  const rows = await page.$$eval('tbody tr', trs => trs.map(tr => tr.innerText));
  console.log('Table rows:', rows);
  
  await browser.close();
})();
