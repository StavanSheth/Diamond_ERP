-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockId" TEXT NOT NULL,
    "ledgerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openingCarat" DECIMAL NOT NULL DEFAULT 0,
    "openingValue" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ledger_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partyCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DiamondItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemCode" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "carat" DECIMAL NOT NULL,
    "color" TEXT NOT NULL,
    "clarity" TEXT NOT NULL,
    "cut" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "polish" TEXT,
    "symmetry" TEXT,
    "fluorescence" TEXT,
    "category" TEXT NOT NULL DEFAULT 'SINGLE',
    "certificationState" TEXT,
    "polishState" TEXT,
    "lengthMm" DECIMAL,
    "widthMm" DECIMAL,
    "depthMm" DECIMAL,
    "ratePerCarat" DECIMAL NOT NULL,
    "currentValue" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "locationId" TEXT,
    "certificateStatus" TEXT NOT NULL,
    "currentCertificateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiamondItem_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DiamondItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ledgerId" TEXT NOT NULL,
    "transactionNo" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL,
    "transactionType" TEXT NOT NULL,
    "partyId" TEXT,
    "remarks" TEXT,
    "referenceNo" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "Ledger" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "diamondItemId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "carat" DECIMAL NOT NULL,
    "ratePerCarat" DECIMAL NOT NULL,
    "totalValue" DECIMAL NOT NULL,
    "itemAction" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransactionItem_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diamondItemId" TEXT NOT NULL,
    "transactionId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "partyId" TEXT,
    "caratBefore" DECIMAL,
    "caratAfter" DECIMAL,
    "rateBefore" DECIMAL,
    "rateAfter" DECIMAL,
    "valueBefore" DECIMAL,
    "valueAfter" DECIMAL,
    "statusBefore" TEXT,
    "statusAfter" TEXT,
    "stockBeforeId" TEXT,
    "stockAfterId" TEXT,
    "locationBeforeId" TEXT,
    "locationAfterId" TEXT,
    "certificateBeforeId" TEXT,
    "certificateAfterId" TEXT,
    "polishBefore" TEXT,
    "polishAfter" TEXT,
    "symmetryBefore" TEXT,
    "symmetryAfter" TEXT,
    "colorBefore" TEXT,
    "colorAfter" TEXT,
    "clarityBefore" TEXT,
    "clarityAfter" TEXT,
    "cutBefore" TEXT,
    "cutAfter" TEXT,
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemEvent_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ItemEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ItemEvent_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diamondItemId" TEXT,
    "transactionId" TEXT,
    "labType" TEXT,
    "reportNumber" TEXT,
    "certificateStatus" TEXT DEFAULT 'PENDING',
    "cost" DECIMAL DEFAULT 0,
    "measurements" TEXT,
    "polish" TEXT,
    "symmetry" TEXT,
    "fluorescence" TEXT,
    "laserInscription" TEXT,
    "naturalOrLabGrown" TEXT,
    "pdfPath" TEXT,
    "proportionDiagramPath" TEXT,
    "inclusionPlotPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Certification_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Certification_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diamondItemId" TEXT NOT NULL,
    "transactionId" TEXT,
    "repairType" TEXT NOT NULL,
    "vendorPartyId" TEXT NOT NULL,
    "dateSent" DATETIME NOT NULL,
    "dateCompleted" DATETIME,
    "caratBefore" DECIMAL NOT NULL,
    "caratAfter" DECIMAL,
    "cost" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Repair_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Repair_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Repair_vendorPartyId_fkey" FOREIGN KEY ("vendorPartyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stockId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "parentLocationId" TEXT,
    CONSTRAINT "Location_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diamondItemId" TEXT NOT NULL,
    "transactionId" TEXT,
    "movementType" TEXT NOT NULL,
    "fromStockId" TEXT,
    "toStockId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "caratMoved" DECIMAL NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "movementDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "partyId" TEXT,
    "diamondItemId" TEXT,
    "entryType" TEXT NOT NULL,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialEntry_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemTransformation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diamondItemId" TEXT NOT NULL,
    "transactionId" TEXT,
    "transformationType" TEXT NOT NULL,
    "dateStarted" DATETIME NOT NULL,
    "dateCompleted" DATETIME,
    "caratBefore" DECIMAL NOT NULL,
    "caratAfter" DECIMAL,
    "colorBefore" TEXT,
    "colorAfter" TEXT,
    "clarityBefore" TEXT,
    "clarityAfter" TEXT,
    "cutBefore" TEXT,
    "cutAfter" TEXT,
    "polishBefore" TEXT,
    "polishAfter" TEXT,
    "symmetryBefore" TEXT,
    "symmetryAfter" TEXT,
    "valueBefore" DECIMAL NOT NULL,
    "valueAfter" DECIMAL,
    "vendorPartyId" TEXT,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItemTransformation_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ItemTransformation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ItemTransformation_vendorPartyId_fkey" FOREIGN KEY ("vendorPartyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemValuationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "diamondItemId" TEXT NOT NULL,
    "transactionId" TEXT,
    "valuationType" TEXT NOT NULL,
    "rateBefore" DECIMAL NOT NULL,
    "rateAfter" DECIMAL NOT NULL,
    "valueBefore" DECIMAL NOT NULL,
    "valueAfter" DECIMAL NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemValuationHistory_diamondItemId_fkey" FOREIGN KEY ("diamondItemId") REFERENCES "DiamondItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ItemValuationHistory_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Stock_stockCode_key" ON "Stock"("stockCode");

-- CreateIndex
CREATE UNIQUE INDEX "Party_partyCode_key" ON "Party"("partyCode");

-- CreateIndex
CREATE UNIQUE INDEX "DiamondItem_itemCode_key" ON "DiamondItem"("itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionNo_key" ON "Transaction"("transactionNo");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
