import { Controller, Post, Body } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  createCheckout(@Body('priceId') priceId: string) {
    return this.billingService.createCheckoutSession(priceId);
  }
}
