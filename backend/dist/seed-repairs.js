"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const enums_1 = require("./types/enums");
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seeding repairs...');
    // Find a vendor party
    let vendor = await prisma.party.findFirst({ where: { partyType: 'VENDOR' } });
    if (!vendor) {
        vendor = await prisma.party.findFirst({});
        if (!vendor) {
            console.log('No parties exist, cannot seed repairs.');
            return;
        }
    }
    // Find a few ACTIVE diamond items
    const items = await prisma.diamondItem.findMany({
        where: { status: 'AVAILABLE' },
        take: 5
    });
    if (items.length === 0) {
        console.log('No active diamond items found');
        return;
    }
    for (const item of items) {
        // 1. Create repair
        const repair = await prisma.repair.create({
            data: {
                diamondItemId: item.id,
                vendorPartyId: vendor.id,
                repairType: 'REPOLISH',
                caratBefore: item.carat,
                cost: 2500,
                status: enums_1.RepairStatus.IN_PROGRESS,
                dateSent: new Date(),
                remarks: 'Seeded for testing'
            }
        });
        // 2. Update item status
        await prisma.diamondItem.update({
            where: { id: item.id },
            data: { status: enums_1.ItemStatus.IN_REPAIR }
        });
        // 3. Movement
        await prisma.inventoryMovement.create({
            data: {
                diamondItemId: item.id,
                movementType: enums_1.MovementType.REPAIR_OUT,
                fromStockId: item.stockId,
                fromLocationId: item.locationId,
                caratMoved: item.carat,
                quantity: 1,
                movementDate: new Date(),
                createdBy: 'system'
            }
        });
        // 4. Event
        await prisma.itemEvent.create({
            data: {
                diamondItemId: item.id,
                eventType: enums_1.ItemEventType.REPAIRED,
                eventDate: new Date(),
                partyId: vendor.id,
                caratBefore: item.carat,
                caratAfter: item.carat,
                statusBefore: 'AVAILABLE',
                statusAfter: enums_1.ItemStatus.IN_REPAIR,
                createdBy: 'system',
                remarks: 'Sent for REPOLISH'
            }
        });
        console.log(`Sent item ${item.itemCode} to repair ${repair.id}`);
    }
    console.log('Done!');
}
main()
    .catch(e => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-repairs.js.map