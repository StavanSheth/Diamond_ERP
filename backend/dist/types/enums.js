"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValuationType = exports.FinancialEntryType = exports.CertificateState = exports.ItemStatus = exports.MovementType = exports.TransformationType = exports.RepairType = exports.RepairStatus = exports.CertificationStatus = exports.ItemEventType = exports.TransactionItemAction = exports.TransactionType = exports.LedgerType = exports.PartyType = void 0;
var PartyType;
(function (PartyType) {
    PartyType["CUSTOMER"] = "CUSTOMER";
    PartyType["SUPPLIER"] = "SUPPLIER";
    PartyType["WORKSHOP"] = "WORKSHOP";
    PartyType["CERTIFICATION_LAB"] = "CERTIFICATION_LAB";
    PartyType["OTHER"] = "OTHER";
})(PartyType || (exports.PartyType = PartyType = {}));
var LedgerType;
(function (LedgerType) {
    LedgerType["INVENTORY"] = "INVENTORY";
    LedgerType["FINANCIAL"] = "FINANCIAL";
})(LedgerType || (exports.LedgerType = LedgerType = {}));
var TransactionType;
(function (TransactionType) {
    TransactionType["PURCHASE"] = "PURCHASE";
    TransactionType["SALE"] = "SALE";
    TransactionType["RETURN"] = "RETURN";
    TransactionType["REPAIR"] = "REPAIR";
    TransactionType["REPAIR_IN"] = "REPAIR_IN";
    TransactionType["CERTIFICATION"] = "CERTIFICATION";
    TransactionType["CERTIFICATION_IN"] = "CERTIFICATION_IN";
    TransactionType["TRANSFER"] = "TRANSFER";
    TransactionType["ADJUSTMENT"] = "ADJUSTMENT";
    TransactionType["ADD_IN"] = "ADD_IN";
    TransactionType["WRITE_OFF"] = "WRITE_OFF";
    TransactionType["TRANSFORMATION"] = "TRANSFORMATION";
})(TransactionType || (exports.TransactionType = TransactionType = {}));
var TransactionItemAction;
(function (TransactionItemAction) {
    TransactionItemAction["IN"] = "IN";
    TransactionItemAction["OUT"] = "OUT";
})(TransactionItemAction || (exports.TransactionItemAction = TransactionItemAction = {}));
var ItemEventType;
(function (ItemEventType) {
    ItemEventType["PURCHASED"] = "PURCHASED";
    ItemEventType["SOLD"] = "SOLD";
    ItemEventType["RETURNED"] = "RETURNED";
    ItemEventType["REPAIRED"] = "REPAIRED";
    ItemEventType["CERTIFIED"] = "CERTIFIED";
    ItemEventType["TRANSFERRED"] = "TRANSFERRED";
    ItemEventType["ADJUSTED"] = "ADJUSTED";
    ItemEventType["WRITTEN_OFF"] = "WRITTEN_OFF";
    ItemEventType["TRANSFORMED"] = "TRANSFORMED";
})(ItemEventType || (exports.ItemEventType = ItemEventType = {}));
var CertificationStatus;
(function (CertificationStatus) {
    CertificationStatus["PENDING"] = "PENDING";
    CertificationStatus["SUBMITTED"] = "SUBMITTED";
    CertificationStatus["ISSUED"] = "ISSUED";
    CertificationStatus["REJECTED"] = "REJECTED";
    CertificationStatus["EXPIRED"] = "EXPIRED";
    CertificationStatus["REPLACED"] = "REPLACED";
    CertificationStatus["CANCELLED"] = "CANCELLED";
})(CertificationStatus || (exports.CertificationStatus = CertificationStatus = {}));
var RepairStatus;
(function (RepairStatus) {
    RepairStatus["IN_PROGRESS"] = "IN_PROGRESS";
    RepairStatus["COMPLETED"] = "COMPLETED";
    RepairStatus["CANCELLED"] = "CANCELLED";
})(RepairStatus || (exports.RepairStatus = RepairStatus = {}));
var RepairType;
(function (RepairType) {
    RepairType["REPOLISH"] = "REPOLISH";
    RepairType["SETTING_REPAIR"] = "SETTING_REPAIR";
    RepairType["CHIP_REPAIR"] = "CHIP_REPAIR";
    RepairType["SYMMETRY_CORRECTION"] = "SYMMETRY_CORRECTION";
    RepairType["SURFACE_REPAIR"] = "SURFACE_REPAIR";
    RepairType["OTHER"] = "OTHER";
})(RepairType || (exports.RepairType = RepairType = {}));
var TransformationType;
(function (TransformationType) {
    TransformationType["CUT"] = "CUT";
    TransformationType["RECUT"] = "RECUT";
    TransformationType["POLISH"] = "POLISH";
    TransformationType["REPOLISH"] = "REPOLISH";
    TransformationType["REWORK"] = "REWORK";
    TransformationType["SPLIT"] = "SPLIT";
    TransformationType["MERGE"] = "MERGE";
    TransformationType["RECLASSIFICATION"] = "RECLASSIFICATION";
    TransformationType["OTHER"] = "OTHER";
})(TransformationType || (exports.TransformationType = TransformationType = {}));
var MovementType;
(function (MovementType) {
    MovementType["PURCHASE"] = "PURCHASE";
    MovementType["SALE"] = "SALE";
    MovementType["RETURN"] = "RETURN";
    MovementType["TRANSFER"] = "TRANSFER";
    MovementType["REPAIR_OUT"] = "REPAIR_OUT";
    MovementType["REPAIR_IN"] = "REPAIR_IN";
    MovementType["CERTIFICATION_OUT"] = "CERTIFICATION_OUT";
    MovementType["CERTIFICATION_IN"] = "CERTIFICATION_IN";
    MovementType["WRITE_OFF"] = "WRITE_OFF";
    MovementType["ADJUSTMENT"] = "ADJUSTMENT";
    MovementType["TRANSFORMATION"] = "TRANSFORMATION";
})(MovementType || (exports.MovementType = MovementType = {}));
var ItemStatus;
(function (ItemStatus) {
    ItemStatus["AVAILABLE"] = "AVAILABLE";
    ItemStatus["SOLD"] = "SOLD";
    ItemStatus["IN_REPAIR"] = "IN_REPAIR";
    ItemStatus["IN_CERTIFICATION"] = "IN_CERTIFICATION";
    ItemStatus["WRITTEN_OFF"] = "WRITTEN_OFF";
    ItemStatus["IN_TRANSIT"] = "IN_TRANSIT";
    ItemStatus["RESERVED"] = "RESERVED";
})(ItemStatus || (exports.ItemStatus = ItemStatus = {}));
var CertificateState;
(function (CertificateState) {
    CertificateState["NONE"] = "NONE";
    CertificateState["PENDING"] = "PENDING";
    CertificateState["RECEIVED"] = "RECEIVED";
})(CertificateState || (exports.CertificateState = CertificateState = {}));
var FinancialEntryType;
(function (FinancialEntryType) {
    FinancialEntryType["PURCHASE"] = "PURCHASE";
    FinancialEntryType["SALE"] = "SALE";
    FinancialEntryType["REFUND"] = "REFUND";
    FinancialEntryType["REPAIR_EXPENSE"] = "REPAIR_EXPENSE";
    FinancialEntryType["CERTIFICATION_EXPENSE"] = "CERTIFICATION_EXPENSE";
    FinancialEntryType["ADJUSTMENT"] = "ADJUSTMENT";
    FinancialEntryType["WRITE_OFF"] = "WRITE_OFF";
    FinancialEntryType["OTHER"] = "OTHER";
})(FinancialEntryType || (exports.FinancialEntryType = FinancialEntryType = {}));
var ValuationType;
(function (ValuationType) {
    ValuationType["PURCHASE_COST"] = "PURCHASE_COST";
    ValuationType["MARKET_REVALUATION"] = "MARKET_REVALUATION";
    ValuationType["REPAIR_REVALUATION"] = "REPAIR_REVALUATION";
    ValuationType["CERTIFICATION_REVALUATION"] = "CERTIFICATION_REVALUATION";
    ValuationType["ADJUSTMENT"] = "ADJUSTMENT";
    ValuationType["SALE"] = "SALE";
    ValuationType["OTHER"] = "OTHER";
})(ValuationType || (exports.ValuationType = ValuationType = {}));
//# sourceMappingURL=enums.js.map