import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RoleName } from "@prisma/client";
import { hash } from "argon2";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const createTallarUser = async () => {
  const user = {
    email: process.env["SEED_USER_EMAIL"]!,
    username: process.env["SEED_USER_USERNAME"]!,
    password: process.env["SEED_USER_PASSWORD"]!,
    phone: process.env["SEED_USER_PHONE"]!,
    name: process.env["SEED_USER_NAME"]!,
    surname: process.env["SEED_USER_SURNAME"]!,
  };

  const created = await prisma.user.create({
    data: {
      email: user.email,
      username: user.username,
      password: await hash(user.password),
      phone: user.phone,
      name: user.name,
      surname: user.surname,
    },
  });

  const superAdminRole = await prisma.role.findUnique({
    where: { name: RoleName.SUPERADMIN },
    select: { id: true },
  });
  if (superAdminRole) {
    await prisma.userRoleAssignment.create({
      data: { userId: created.id, roleId: superAdminRole.id, assignedBy: null },
    });
  }
};

const fakeUsers = [
  {
    email: "user1@example.com",
    username: "user1",
    password: "123456Bb.",
    name: "User 1",
    surname: "User 1",
  },
  {
    email: "user2@example.com",
    username: "user2",
    password: "123456Bb.",
    name: "User 2",
    surname: "User 2",
  },
  {
    email: "user3@example.com",
    username: "user3",
    password: "123456Bb.",
    name: "User 3",
    surname: "User 3",
  },
  {
    email: "user4@example.com",
    username: "user4",
    password: "123456Bb.",
    name: "User 4",
    surname: "User 4",
  },
  {
    email: "user5@example.com",
    username: "user5",
    password: "123456Bb.",
    name: "User 5",
    surname: "User 5",
  },
];

export const createFakeUsers = async () => {
  const hashedUsers = await Promise.all(
    fakeUsers.map(async (user) => ({
      ...user,
      password: await hash(user.password),
    })),
  );
  const created = await prisma.user.createMany({
    data: hashedUsers,
    skipDuplicates: true,
  });

  // Assign default LEARNER role to all users without roles (idempotent)
  const learnerRole = await prisma.role.findUnique({
    where: { name: RoleName.LEARNER },
    select: { id: true },
  });
  if (!learnerRole) return;

  const users = await prisma.user.findMany({
    select: { id: true },
  });
  await prisma.userRoleAssignment.createMany({
    data: users.map((u) => ({ userId: u.id, roleId: learnerRole.id })),
    skipDuplicates: true,
  });
};
