import { PrismaPg } from "@prisma/adapter-pg";
import {
  PaymentProvider,
  PaymentStatus,
  PrismaClient,
  SubscriptionStatus,
} from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export const seedSubscriptions = async () => {
  const [user1, user2, user3, premiumPlan, welcomeCoupon] = await Promise.all([
    prisma.user.findUnique({ where: { email: "user1@example.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "user2@example.com" }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: "user3@example.com" }, select: { id: true } }),
    prisma.plan.findUnique({ where: { code: "PREMIUM_MONTHLY" }, select: { id: true, priceCents: true } }),
    prisma.coupon.findUnique({ where: { code: "WELCOME10" }, select: { id: true } }),
  ]);

  if (!user1 || !user2 || !user3 || !premiumPlan) {
    console.warn("⚠️  Subscriptions seed: не найдены нужные пользователи или план.");
    return;
  }

  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const monthAhead = new Date(now);
  monthAhead.setMonth(monthAhead.getMonth() + 1);
  const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // ─── user1: активная подписка + оплата + купон WELCOME10 ─────────────────
  const sub1 = await prisma.subscription.create({
    data: {
      userId: user1.id,
      planId: premiumPlan.id,
      status: SubscriptionStatus.ACTIVE,
      startDate: monthAgo,
      endDate: monthAhead,
      provider: PaymentProvider.MANUAL,
    },
  });

  const payment1 = await prisma.payment.create({
    data: {
      userId: user1.id,
      subscriptionId: sub1.id,
      provider: PaymentProvider.MANUAL,
      status: PaymentStatus.SUCCEEDED,
      amountCents: premiumPlan.priceCents,
      currency: "USD",
    },
  });

  if (welcomeCoupon) {
    await prisma.couponRedemption.create({
      data: {
        couponId: welcomeCoupon.id,
        userId: user1.id,
        paymentId: payment1.id,
      },
    });
    await prisma.coupon.update({
      where: { id: welcomeCoupon.id },
      data: { redeemedCount: { increment: 1 } },
    });
  }

  // ─── user2: пробный период (триал, без оплаты) ───────────────────────────
  await prisma.subscription.create({
    data: {
      userId: user2.id,
      planId: premiumPlan.id,
      status: SubscriptionStatus.TRIALING,
      startDate: now,
      endDate: twoWeeksAhead,
      provider: PaymentProvider.MANUAL,
    },
  });

  // ─── user3: отменённая подписка + возврат платежа ────────────────────────
  const sub3 = await prisma.subscription.create({
    data: {
      userId: user3.id,
      planId: premiumPlan.id,
      status: SubscriptionStatus.CANCELED,
      startDate: monthAgo,
      endDate: now,
      canceledAt: now,
      provider: PaymentProvider.MANUAL,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user3.id,
      subscriptionId: sub3.id,
      provider: PaymentProvider.MANUAL,
      status: PaymentStatus.REFUNDED,
      amountCents: premiumPlan.priceCents,
      refundedCents: premiumPlan.priceCents,
      currency: "USD",
    },
  });

  const redemptionNote = welcomeCoupon ? ", погашений купонов — 1" : "";
  console.log(`✅  Subscriptions seed: подписок — 3, оплат — 2${redemptionNote}`);
};
