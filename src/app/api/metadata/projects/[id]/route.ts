import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiResponse, apiError } from "@/lib/utils";
import { requireAuthAndPermission } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

const ProjectUpdateSchema = z.object({
  projectCode: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9\-_.]+$/i, "Code must be alphanumeric")
    .optional(),
  projectName: z.string().min(1).max(200).optional(),
  parentId: z.string().uuid().optional().nullable(),
  entityId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  budget: z.number().optional().nullable(),
  currency: z.string().length(3).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"]).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/**
 * Walk up the parent chain to detect circular references.
 * Returns true if setting newParentId on projectId would create a cycle.
 */
async function wouldCreateCycle(
  projectId: string,
  newParentId: string,
  tenantId: string
): Promise<boolean> {
  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId !== null) {
    if (currentId === projectId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);

    const node: { parentId: string | null } | null = await prisma.project.findFirst({
      where: { id: currentId, tenantId },
      select: { parentId: true },
    });
    if (!node) break;
    currentId = node.parentId;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "project", "read");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const record = await prisma.project.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: {
      parent: { select: { id: true, projectCode: true, projectName: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          projectCode: true,
          projectName: true,
          status: true,
          isActive: true,
          sortOrder: true,
        },
      },
    },
  });
  if (!record) return apiError("Project not found", 404);

  return apiResponse(record);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "project", "update");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.project.findFirst({
    where: { id: params.id, tenantId: auth.tid },
  });
  if (!existing) return apiError("Project not found", 404);

  const body = await req.json();
  const parsed = ProjectUpdateSchema.safeParse(body);
  if (!parsed.success) return apiError("Validation failed", 400, parsed.error.flatten());

  // Prevent self-parent
  if (parsed.data.parentId === params.id) {
    return apiError("A project cannot be its own parent", 400);
  }

  // Validate new parent exists in same tenant and check for cycles
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== null) {
    const parentProject = await prisma.project.findFirst({
      where: { id: parsed.data.parentId, tenantId: auth.tid },
    });
    if (!parentProject) return apiError("Parent project not found", 400);

    const cycle = await wouldCreateCycle(params.id, parsed.data.parentId, auth.tid);
    if (cycle) return apiError("Setting this parent would create a circular hierarchy", 400);
  }

  // Check code uniqueness if changing
  if (parsed.data.projectCode && parsed.data.projectCode !== existing.projectCode) {
    const conflict = await prisma.project.findUnique({
      where: {
        tenantId_projectCode: { tenantId: auth.tid, projectCode: parsed.data.projectCode },
      },
    });
    if (conflict) return apiError(`Project code '${parsed.data.projectCode}' already exists`, 409);
  }

  const { startDate, endDate, ...rest } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    ...rest,
    updatedBy: auth.sub,
    ...(startDate !== undefined && { startDate: startDate != null ? new Date(startDate) : null }),
    ...(endDate !== undefined && { endDate: endDate != null ? new Date(endDate) : null }),
  };

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: updateData,
  });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "projects",
    recordId: params.id,
    dimensionType: "PROJECT",
    action: "UPDATE",
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    userId: auth.sub,
    userName: auth.name,
    userEmail: auth.email,
    userRole: auth.role,
  });

  return apiResponse(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuthAndPermission(req, "project", "delete");
  if (!("auth" in authResult)) return authResult;
  const { auth } = authResult;

  const existing = await prisma.project.findFirst({
    where: { id: params.id, tenantId: auth.tid },
    include: { _count: { select: { children: true } } },
  });
  if (!existing) return apiError("Project not found", 404);

  if (existing._count.children > 0) {
    return apiError(
      `Cannot delete project: it has ${existing._count.children} child project(s). Remove children first.`,
      409
    );
  }

  await prisma.project.delete({ where: { id: params.id } });

  await writeAuditLog({
    tenantId: auth.tid,
    tableName: "projects",
    recordId: params.id,
    dimensionType: "PROJECT",
    action: "DELETE",
    oldValue: existing as unknown as Record<string, unknown>,
    userId: auth.su