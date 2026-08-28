require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

async function test() {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  
  const ledgerSheet = doc.sheetsByTitle['Stock_Ledger'];
  const masterSheet = doc.sheetsByTitle['Stock_Master'];

  console.log("Before Add:");
  let rows = await ledgerSheet.getRows();
  console.log("Total rows:", rows.length);

  // 1. Hit API to add
  const addRes = await fetch('http://localhost:3001/api/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stockId: 'STK-000001',
      stockName: 'WHITE STAR',
      origin: 'Rough Item',
      txnType: 'Sale / Memo',
      weight: 1.5,
      rate: 50000,
      artisan: 'PTY-000001', 
      broker: 'PTY-000002', 
      remarks: 'Test sale'
    })
  });
  console.log("Add API Res:", await addRes.json());

  // Check rows
  rows = await ledgerSheet.getRows();
  const addedRow = rows[rows.length - 1];
  console.log("Added row in sheet:", addedRow.toObject());
  const ledgerId = addedRow.get('Ledger_ID');

  // 2. Hit API to get
  const getRes = await fetch('http://localhost:3001/api/ledger?stock=WHITE STAR');
  const getData = await getRes.json();
  const apiReturnedRow = getData.data.find(d => d.ledgerId === ledgerId);
  console.log("API returned for new row:", apiReturnedRow);

  // 3. Hit API to delete
  const delRes = await fetch(`http://localhost:3001/api/ledger/${ledgerId}`, { method: 'DELETE' });
  console.log("Delete API Res:", await delRes.json());

  rows = await ledgerSheet.getRows();
  console.log("Total rows after delete:", rows.length);
}
test();
