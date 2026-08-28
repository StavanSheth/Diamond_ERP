const Database = require('better-sqlite3');
const oldDb = new Database('C:/Users/Stavan/.gemini/antigravity-ide/brain/0e355552-19b3-4ca1-8d59-e94fb635517f/diamond_erp_backup_2026_08_27.sqlite', { readonly: true });
const newDb = new Database('./prisma/dev.db');
newDb.pragma('foreign_keys = OFF');

const tables = oldDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'").all();
console.log(tables.map(t => t.name));

for (const { name } of tables) {
    console.log(`Copying ${name}...`);
    const rows = oldDb.prepare(`SELECT * FROM "${name}"`).all();
    if (rows.length === 0) continue;
    
    const columns = Object.keys(rows[0]);
    // check which columns exist in new DB
    const newDbColsInfo = newDb.prepare(`PRAGMA table_info("${name}")`).all();
    const newDbColNames = new Set(newDbColsInfo.map(c => c.name));
    
    // Some columns might have been added in the new DB, some might have been dropped in the new DB.
    // We only copy columns that exist in BOTH databases.
    const commonCols = columns.filter(c => newDbColNames.has(c));
    
    if (commonCols.length === 0) continue;
    
    const isTransaction = name === 'Transaction';
    if (isTransaction) {
        if (!commonCols.includes('sequenceNumber')) commonCols.push('sequenceNumber');
        if (!commonCols.includes('status')) commonCols.push('status');
        if (!commonCols.includes('version')) commonCols.push('version');
    }
    if (name === 'DocumentDraft' && !commonCols.includes('version')) commonCols.push('version');
    if ((name === 'RecordVersion' || name === 'DraftRevision') && !commonCols.includes('snapshotSchemaVersion')) {
        commonCols.push('snapshotSchemaVersion');
    }

    const placeholders = commonCols.map(() => '?').join(', ');
    const insertStmt = newDb.prepare(`INSERT INTO "${name}" (${commonCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`);
    
    let seq = 1;
    newDb.transaction(() => {
        for (const row of rows) {
            if (isTransaction) {
                row.sequenceNumber = seq++;
                row.status = 'POSTED';
                row.version = 1;
            }
            if (name === 'DocumentDraft') row.version = 1;
            if (name === 'RecordVersion' || name === 'DraftRevision') row.snapshotSchemaVersion = 1;
            
            // Recompute values after setting defaults
            const values = commonCols.map(c => row[c] !== undefined ? row[c] : null);
            try {
                insertStmt.run(values);
            } catch(e) {
                console.error(`Error inserting into ${name}`, e.message);
            }
        }
    })();
}
console.log('Restore complete!');
