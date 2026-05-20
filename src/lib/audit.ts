import { prisma } from "./prisma";
import { AuditAction, DimensionType } from "@prisma/client";

interface AuditParams {
  tenantId: string;
  tableName: string;
  recordId: string;
  dimensionType?: DimensionType;
  action: AuditAction;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  ipAddress?: string;
}

export async function writeAuditLog(params: AuditParams) {
  const changedFields: string[] = [];
  if (params.oldValue && params.newValue) {
    for (const key of Object.keys(params.newValue)) {
      if (JSON.stringify(params.oldValue[key]) !== JSON.stringify(params.newValue[key])) {
        changedFields.push(key);
      }
    }
  }
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        tableName: params.tableName,
        recordId: params.recordId,
        dimensionType: params.dimensionType,
        action: params.action,
        oldValue: params.oldValue ? JSON.parse(JSON.stringify(params.oldValue)) : undefined,
        newValue: params.newValue ? JSON.parse(JSON.stringify(params.newValue)) : undefined,
        changedFields,
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail,
        userRole: params.userRole,
        ipAddress: params.ipAddress,
      },
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write audit:", err);
  }
}
