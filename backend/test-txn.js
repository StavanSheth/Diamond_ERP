async function test() {
  console.log("Adding transaction...");
  try {
    const res = await fetch('http://localhost:3001/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stockId: 'STK-000001',
        stockName: 'WHITE STAR',
        origin: 'Rough Item',
        txnType: 'Sale / Memo',
        weight: 1.5,
        rate: 50000,
        artisan: 'PTY-000001', // Client
        broker: 'PTY-000002', // Broker
        remarks: 'Test sale'
      })
    });
    const data = await res.json();
    console.log("Response:", data);

    if (data.success) {
      console.log("Fetching ledger for WHITE STAR...");
      const ledgerRes = await fetch('http://localhost:3001/api/ledger?stock=WHITE STAR');
      const ledgerData = await ledgerRes.json();
      console.log("New Entry:", ledgerData.data[ledgerData.data.length - 1]); // the new entry
    }
  } catch (err) {
    console.error(err);
  }
}
test();
