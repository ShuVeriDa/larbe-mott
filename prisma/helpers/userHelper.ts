import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();

export const createTallarUser = async () => {
  const user = {
    email: "tallar@tallar.du",
    username: "tallar",
    password: "123456Bb.",
    phone: "+79635940530",
    name: "Tallar",
    surname: "Vu So",
    role: UserRole.ADMIN,
  };

  await prisma.user.create({
    data: {
      email: user.email,
      username: user.username,
      password: await hash(user.password),
      phone: user.phone,
      name: user.name,
      surname: user.surname,
      role: user.role,
    },
  });
};
