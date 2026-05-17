export type AssetCategory = "IT" | "Office" | "Furniture" | "Vehicle" | "Machinery" | "Other";
export type AssetStatus = "Available" | "In Use" | "Under Maintenance" | "Retired" | "Missing";
export type AssetCondition = "Excellent" | "Good" | "Fair" | "Poor" | "Broken";

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  serialNumber?: string;
  purchaseDate?: string;
  cost?: number;
  locationId?: string;
  status: AssetStatus;
  condition: AssetCondition;
  nextMaintenanceDate?: string;
  lastMaintenanceDate?: string;
  ownerId: string;
  createdAt: any;
  updatedAt: any;
  image?: string;
}

export interface Location {
  id: string;
  name: string;
  description?: string;
}

export type MaintenanceType = "Routine" | "Repair" | "Upgrade" | "Inspection";
export type MaintenanceStatus = "Completed" | "Scheduled";

export interface MaintenanceLog {
  id: string;
  assetId: string;
  ownerId: string;
  date: string;
  type: MaintenanceType;
  description: string;
  cost?: number;
  performedBy: string;
  status: MaintenanceStatus;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
