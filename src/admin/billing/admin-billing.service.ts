import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CouponType,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { CreatePlanDto } from "./dto/create-plan.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { ExtendSubscriptionDto } from "./dto/extend-subscription.dto";
import { RefundPaymentDto } from "./dto/refund-payment.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { UpdatePlanDto } from "./dto/update-plan.dto";

@Injectable()
export class AdminBillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Plans ----------------
  async getPlans() {
    return this.prisma.plan.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createPlan(dto: CreatePlanDto) {
    return this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        type: dto.type,
        priceCents: dto.priceCents,
        currency: dto.currency ?? "USD",
        interval: dto.interval ?? null,
        isActive: dto.isActive ?? true,
        limits: (dto.limits ?? null) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("Plan not found");

    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.interval !== undefined && { interval: dto.interval }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.limits !== undefined && {
          limits: dto.limits as unknown as Prisma.InputJsonValue,
        }),
      },
    });
  }

  // ---------------- Subscriptions ----------------
  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    });
  }

  async createUserSubscription(userId: string, dto: CreateSubscriptionDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) throw new NotFoundException("Plan not found");

    const now = new Date();
    const isLifetime = dto.isLifetime ?? false;
    const trialDays = dto.trialDays;

    let status: SubscriptionStatus = dto.status ?? SubscriptionStatus.ACTIVE;
    let endDate: Date | null = null;

    if (isLifetime) {
      status = SubscriptionStatus.ACTIVE;
      endDate = null;
    } else if (trialDays) {
      status = SubscriptionStatus.TRIALING;
      endDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
    } else {
      // If plan has interval and price > 0, admin-created subscription must set an endDate manually later
      endDate = null;
    }

    return this.prisma.subscription.create({
      data: {
        userId,
        planId: dto.planId,
        status,
        isLifetime,
        startDate: now,
        endDate,
        provider: dto.provider ?? "MANUAL",
      },
      include: { plan: true },
    });
  }

  async cancelSubscription(id: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Subscription not found");

    return this.prisma.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: new Date(),
      },
      include: { plan: true },
    });
  }

  async extendSubscription(id: string, dto: ExtendSubscriptionDto) {
    const existing = await this.prisma.subscription.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Subscription not found");
    if (existing.isLifetime) {
      throw new BadRequestException("Lifetime subscription cannot be extended");
    }

    const base = existing.endDate ?? new Date();
    const endDate = new Date(
      base.getTime() + dto.extendDays * 24 * 60 * 60 * 1000,
    );

    return this.prisma.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        endDate,
      },
      include: { plan: true },
    });
  }

  // ---------------- Payments ----------------
  async getPayments() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { subscription: { include: { plan: true } }, user: true },
    });
  }

  async refundPayment(id: string, dto: RefundPaymentDto) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException("Payment not found");

    const remaining = payment.amountCents - payment.refundedCents;
    if (remaining <= 0) {
      throw new BadRequestException("Payment already fully refunded");
    }
    const toRefund = dto.amountCents ?? remaining;
    if (toRefund <= 0 || toRefund > remaining) {
      throw new BadRequestException("Invalid refund amount");
    }

    return this.prisma.payment.update({
      where: { id },
      data: {
        refundedCents: { increment: toRefund },
        status:
          toRefund === remaining ? PaymentStatus.REFUNDED : payment.status,
      },
    });
  }

  // ---------------- Coupons ----------------
  async getCoupons() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createCoupon(dto: CreateCouponDto) {
    if (dto.type === CouponType.PERCENT && dto.amount > 100) {
      throw new BadRequestException("Percent coupon amount must be <= 100");
    }

    return this.prisma.coupon.create({
      data: {
        code: dto.code,
        type: dto.type,
        amount: dto.amount,
        maxRedemptions: dto.maxRedemptions ?? null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCoupon(id: string, dto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException("Coupon not found");

    if (dto.type === CouponType.PERCENT && dto.amount && dto.amount > 100) {
      throw new BadRequestException("Percent coupon amount must be <= 100");
    }
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.maxRedemptions !== undefined && {
          maxRedemptions: dto.maxRedemptions,
        }),
        ...(dto.validFrom !== undefined && {
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
        }),
        ...(dto.validUntil !== undefined && {
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async redeemCoupon(userId: string, couponCode: string, paymentId?: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: couponCode },
    });
    if (!coupon || !coupon.isActive) {
      throw new BadRequestException("Invalid coupon");
    }

    const now = new Date();
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new BadRequestException("Coupon not active yet");
    }
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new BadRequestException("Coupon expired");
    }

    if (
      coupon.maxRedemptions !== null &&
      coupon.redeemedCount >= coupon.maxRedemptions
    ) {
      throw new BadRequestException("Coupon redemption limit reached");
    }

    // increment redeemedCount and create redemption in a transaction
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.coupon.update({
        where: { id: coupon.id },
        data: { redeemedCount: { increment: 1 } },
      });
      const redemption = await tx.couponRedemption.create({
        data: {
          couponId: updated.id,
          userId,
          paymentId: paymentId ?? null,
        },
      });
      return { coupon: updated, redemption };
    });
  }
}
