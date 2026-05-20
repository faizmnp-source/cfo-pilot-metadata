export type Role = "ADMIN" | "FINANCE_MANAGER" | "FINANCE_USER" | "VIEWER";
export type Action = "create" | "read" | "update" | "delete" | "import" | "export" | "bulkUpdate";
export type Resource =
  | "account"
  | "entity"
  | "department"
  | "costCenter"
  | "currency"
  | "scenario"
  | "time"
  | "icp"
  | "project"
  | "dimension"
  | "importJob"
  | "auditLog"
  | "user";

type PermMatrix = Record<Role, Record<Action, boolean>>;

const PERMISSIONS: Record<Resource, PermMatrix> = {
  account: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  entity: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  department: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  costCenter: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  currency: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  scenario: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:true,  read:true,  update:true,  delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  time: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:true,  read:true,  update:true,  delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  icp: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  project: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  dimension: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  importJob: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:true,  export:true,  bulkUpdate:true  },
    FINANCE_MANAGER: { create:true,  read:true,  update:false, delete:false, import:true,  export:false, bulkUpdate:false },
    FINANCE_USER:    { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    VIEWER:          { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  auditLog: {
    ADMIN:           { create:false, read:true,  update:false, delete:false, import:false, export:true,  bulkUpdate:false },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    FINANCE_USER:    { create:false, read:false, update:false, delete:false, import:false, export:false, bulkUpdate:false },
    VIEWER:          { create:false, read:false, update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
  user: {
    ADMIN:           { create:true,  read:true,  update:true,  delete:true,  import:false, export:false, bulkUpdate:false },
    FINANCE_MANAGER: { create:false, read:true,  update:false, delete:false, import:false, export:false, bulkUpdate:false },
    FINANCE_USER:    { create:false, read:false, update:false, delete:false, import:false, export:false, bulkUpdate:false },
    VIEWER:          { create:false, read:false, update:false, delete:false, import:false, export:false, bulkUpdate:false },
  },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  return PERMISSIONS[resource]?.[role]?.[action] ?? false;
}
