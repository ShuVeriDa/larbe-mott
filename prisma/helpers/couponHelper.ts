import { PrismaPg } from "@prisma/adapter-pg";
import { CouponType, PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const COUPONS = [
  {
    code: "WELCOME10",
    type: CouponType.PERCENT,
    amount: 10,
    maxRedemptions: null,
    validFrom: null,
    validUntil: null,
    isActive: true,
  },
  {
    code: "STUDENT25",
    type: CouponType.PERCENT,
    amount: 25,
    maxRedemptions: 100,
    validFrom: null,
    validUntil: new Date("2026-12-31"),
    isActive: true,
  },
  {
    code: "LAUNCH500",
    type: CouponType.FIXED,
    amount: 500, // $5.00 off
    maxRedemptions: 50,
    validFrom: null,
    validUntil: new Date("2026-06-30"),
    isActive: true,
  },
  {
    code: "EXPIRED20",
    type: CouponType.PERCENT,
    amount: 20,
    maxRedemptions: 200,
    validFrom: new Date("2025-01-01"),
    validUntil: new Date("2025-12-31"),
    isActive: false,
  },
] as const;

export const seedCoupons = async () => {
  for (const coupon of COUPONS) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      create: { ...coupon },
      update: {
        type: coupon.type,
        amount: coupon.amount,
        maxRedemptions: coupon.maxRedemptions ?? null,
        validFrom: coupon.validFrom ?? null,
        validUntil: coupon.validUntil ?? null,
        isActive: coupon.isActive,
      },
    });
  }

  console.log(`✅  Coupons seed: создано купонов — ${COUPONS.length}`);
};
