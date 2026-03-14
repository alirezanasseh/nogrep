import { Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [BillingModule, AuthModule],
})
export class AppModule {}
