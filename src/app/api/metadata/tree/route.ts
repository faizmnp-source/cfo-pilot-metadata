import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";

type NodeMap = Record<string, { id:string; code:string; name:string; parentId:string|null; isActive:boolean; children: NodeMap[keyof NodeMap][] }>;

function buildTree(items: { id:string; parentId:string|null; [k:string]:unknown }[]) {
  const map: NodeMap = {};
  const roots: NodeMap[string][] = [];
  items.forEach(item => {
    map[item.id] = { ...item, code: (item as any).code ?? (item as any).accountCode ?? "", name: (item as any).name ?? (item as any).accountName ?? "", children: [] };
  });
  items.forEach(item => {
    if (item.parentId && map[item.parentId]) map[item.parentId].children.push(map[item.id]);
    else roots.push(map[item.id]);
  });
  return roots;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return apiError("Unauthorized", 401);
  const dim = req.nextUrl.searchParams.get("dimension") ?? "account";
  let items: unknown[] = [];
  if (dim === "account") items = await prisma.account.findMany({ where: { tenantId: auth.tid }, select: { id:true, accountCode:true, accountName:true, parentId:true, isActive:true, accountType:true }, orderBy: { accountCode: "asc" } });
  else if (dim === "entity") items = await prisma.entity.findMany({ where: { tenantId: auth.tid }, select: { id:true, entityCode:true, entityName:true, parentId:true, isActive:true, country:true }, orderBy: { entityCode: "asc" } });
  else if (dim === "department") items = await prisma.department.findMany({ where: { tenantId: auth.tid }, select: { id:true, departmentCode:true, departmentName:true, parentId:true, isActive:true }, orderBy: { departmentCode: "asc" } });
  else if (dim === "costCenter") items = await prisma.costCenter.findMany({ where: { tenantId: auth.tid }, select: { id:true, costCenterCode:true, costCenterName:true, parentId:true, isActive:true }, orderBy: { costCenterCode: "asc" } });

  const normalized = (items as Record<string, unknown>[]).map(item => ({
    ...item,
    id: item.id as string,
    parentId: (item.parentId ?? null) as string | null,
    code: (item.accountCode ?? item.entityCode ?? item.departmentCode ?? item.costCenterCode ?? "") as string,
    name: (item.accountName ?? item.entityName ?? item.departmentName ?? item.costCenterName ?? "") as string,
  }));

  return apiResponse(buildTree(normalized));
}
