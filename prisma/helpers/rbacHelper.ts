import { PrismaPg } from "@prisma/adapter-pg";
import {
  PermissionCode,
  PrismaClient,
  RoleName,
} from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ROLE_MATRIX: Record<RoleName, PermissionCode[]> = {
  LEARNER: [],
  SUPPORT: [
    PermissionCode.CAN_VIEW_ANALYTICS,
    PermissionCode.CAN_VIEW_LOGS,
    PermissionCode.CAN_MANAGE_FEEDBACK,
  ],
  CONTENT: [PermissionCode.CAN_EDIT_TEXTS],
  LINGUIST: [PermissionCode.CAN_EDIT_DICTIONARY, PermissionCode.CAN_EDIT_MORPHOLOGY],
  ADMIN: [
    PermissionCode.CAN_EDIT_TEXTS,
    PermissionCode.CAN_EDIT_DICTIONARY,
    PermissionCode.CAN_MANAGE_USERS,
    PermissionCode.CAN_VIEW_ANALYTICS,
    PermissionCode.CAN_VIEW_LOGS,
    PermissionCode.CAN_MANAGE_FEEDBACK,
  ],
  SUPERADMIN: [
    PermissionCode.CAN_EDIT_TEXTS,
    PermissionCode.CAN_EDIT_DICTIONARY,
    PermissionCode.CAN_EDIT_MORPHOLOGY,
    PermissionCode.CAN_MANAGE_USERS,
    PermissionCode.CAN_MANAGE_BILLING,
    PermissionCode.CAN_VIEW_ANALYTICS,
    PermissionCode.CAN_VIEW_LOGS,
    PermissionCode.CAN_MANAGE_FEATURE_FLAGS,
    PermissionCode.CAN_MANAGE_FEEDBACK,
  ],
};

export async function seedRolesAndPermissions() {
  const roles = Object.values(RoleName);
  const permissions = Object.values(PermissionCode);

  // Upsert roles
  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  // Upsert permissions
  for (const code of permissions) {
    await prisma.permission.upsert({
      where: { code },
      create: { code },
      update: {},
    });
  }

  // Rebuild role-permission matrix (idempotent)
  const roleRows = await prisma.role.findMany({
    select: { id: true, name: true },
  });
  const permRows = await prisma.permission.findMany({
    select: { id: true, code: true },
  });
  const roleIdByName = new Map(roleRows.map((r) => [r.name, r.id]));
  const permIdByCode = new Map(permRows.map((p) => [p.code, p.id]));

  // Clear previous links (safe because we re-create all)
  await prisma.rolePermission.deleteMany({});

  const links: { roleId: string; permissionId: string }[] = [];
  for (const [roleName, codes] of Object.entries(ROLE_MATRIX) as Array<
    [RoleName, PermissionCode[]]
  >) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) continue;
    for (const code of codes) {
      const permissionId = permIdByCode.get(code);
      if (!permissionId) continue;
      links.push({ roleId, permissionId });
    }
  }
  if (links.length) {
    await prisma.rolePermission.createMany({
      data: links,
      skipDuplicates: true,
    });
  }

  // NOTE: user role assignments are created in user seeds / admin APIs.
}
