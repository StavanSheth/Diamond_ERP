export interface BaseEntity {
  id: string; // Maps to ID
  status: string; // Maps to Status
  remarks: string; // Maps to Remarks
  version: number; // Maps to Version
  createdAt: string; // Maps to Created_At
  createdBy: string; // Maps to Created_By
  updatedAt: string; // Maps to Updated_At
  updatedBy: string; // Maps to Updated_By
  isDeleted: boolean; // Maps to Is_Deleted (typically 'TRUE'/'FALSE')
  deletedAt: string; // Maps to Deleted_At
  deletedBy: string; // Maps to Deleted_By
}
