import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { trimCluster } from '../scripts/trim.js'

let tempDir: string

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'nogrep-trim-'))
  await mkdir(join(tempDir, 'src'), { recursive: true })

  // TypeScript fixture
  await writeFile(join(tempDir, 'src', 'billing.service.ts'), `
import { Injectable } from '@nestjs/common'
import Stripe from 'stripe'

// Billing service handles all payment processing
@Injectable()
export class BillingService {
  private stripe: Stripe

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_KEY!, { apiVersion: '2023-10-16' })
  }

  async createSubscription(userId: string, planId: string): Promise<Stripe.Subscription> {
    const customer = await this.stripe.customers.retrieve(userId)
    if (!customer) {
      throw new Error('Customer not found')
    }
    const subscription = await this.stripe.subscriptions.create({
      customer: userId,
      items: [{ price: planId }],
    })
    await this.notifyBilling(subscription)
    return subscription
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.cancel(subscriptionId)
    console.log('Subscription cancelled:', subscriptionId)
  }

  private async notifyBilling(sub: Stripe.Subscription): Promise<void> {
    // Send webhook notification
    const payload = JSON.stringify(sub)
    await fetch('/internal/notify', { method: 'POST', body: payload })
  }

  get isConfigured(): boolean {
    return !!this.stripe
  }
}

export type PaymentStatus = 'pending' | 'completed' | 'failed'

export interface InvoiceData {
  id: string
  amount: number
  status: PaymentStatus
}
`.trim())

  // Python fixture
  await writeFile(join(tempDir, 'src', 'views.py'), `
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from .models import Payment

# Payment views
@require_http_methods(["POST"])
def create_payment(request):
    """Create a new payment record."""
    data = request.POST
    payment = Payment.objects.create(
        user_id=data['user_id'],
        amount=data['amount'],
        status='pending'
    )
    return JsonResponse({'id': payment.id, 'status': payment.status})

@require_http_methods(["GET"])
def get_payment(request, payment_id):
    """Retrieve a payment by ID."""
    try:
        payment = Payment.objects.get(id=payment_id)
        return JsonResponse({
            'id': payment.id,
            'amount': str(payment.amount),
            'status': payment.status,
        })
    except Payment.DoesNotExist:
        return JsonResponse({'error': 'not found'}, status=404)

def _format_amount(amount):
    return str(amount)

class PaymentProcessor:
    MAX_RETRIES = 3

    def __init__(self, api_key):
        self.api_key = api_key
        self.client = None

    def process(self, payment):
        """Process a single payment through the gateway."""
        for attempt in range(self.MAX_RETRIES):
            try:
                result = self.client.charge(payment.amount)
                payment.status = 'completed'
                payment.save()
                return result
            except Exception as e:
                if attempt == self.MAX_RETRIES - 1:
                    raise

    @staticmethod
    def validate(payment):
        """Validate payment data before processing."""
        if payment.amount <= 0:
            raise ValueError("Amount must be positive")
        return True
`.trim())

  // Java fixture
  await writeFile(join(tempDir, 'src', 'UserService.java'), `
package com.example.users;

import java.util.List;
import java.util.Optional;

/**
 * Service for managing user accounts.
 */
public class UserService {

    private final UserRepository userRepository;
    private final EmailService emailService;

    public UserService(UserRepository userRepository, EmailService emailService) {
        this.userRepository = userRepository;
        this.emailService = emailService;
    }

    public User createUser(String name, String email) {
        User user = new User(name, email);
        userRepository.save(user);
        emailService.sendWelcome(user);
        return user;
    }

    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public List<User> findAll() {
        return userRepository.findAll();
    }

    private void validateEmail(String email) {
        if (email == null || !email.contains("@")) {
            throw new IllegalArgumentException("Invalid email");
        }
    }

    public void deleteUser(Long id) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("User not found"));
        userRepository.delete(user);
        emailService.sendGoodbye(user);
    }
}

public interface UserRepository {
    User save(User user);
    Optional<User> findById(Long id);
    List<User> findAll();
    void delete(User user);
}
`.trim())

  // Small file (should not be truncated)
  await writeFile(join(tempDir, 'src', 'types.ts'), `
export type Role = 'admin' | 'user' | 'guest'

export interface User {
  id: string
  name: string
  role: Role
}
`.trim())
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('trimCluster', () => {
  describe('TypeScript trimming', () => {
    it('keeps imports, decorators, class declaration, and method signatures', async () => {
      const result = await trimCluster(['src/billing.service.ts'], tempDir)

      expect(result).toContain('import { Injectable }')
      expect(result).toContain('import Stripe')
      expect(result).toContain('@Injectable()')
      expect(result).toContain('export class BillingService')
      expect(result).toContain('async createSubscription')
      expect(result).toContain('async cancelSubscription')
      expect(result).toContain('export type PaymentStatus')
      expect(result).toContain('export interface InvoiceData')
    })

    it('strips function bodies', async () => {
      const result = await trimCluster(['src/billing.service.ts'], tempDir)

      // Body content should be removed
      expect(result).not.toContain('customers.retrieve')
      expect(result).not.toContain('subscriptions.create')
      expect(result).not.toContain('console.log')
      expect(result).not.toContain('JSON.stringify')
    })

    it('produces output smaller than the original', async () => {
      const result = await trimCluster(['src/billing.service.ts'], tempDir)
      const originalLines = 52 // approximate line count of the fixture
      const trimmedLines = result.split('\n').length

      // Should be roughly 30-50% of original
      expect(trimmedLines).toBeLessThan(originalLines)
    })
  })

  describe('Python trimming', () => {
    it('keeps imports, decorators, class defs, and function signatures', async () => {
      const result = await trimCluster(['src/views.py'], tempDir)

      expect(result).toContain('from django.http import JsonResponse')
      expect(result).toContain('@require_http_methods')
      expect(result).toContain('def create_payment(request)')
      expect(result).toContain('def get_payment(request, payment_id)')
      expect(result).toContain('class PaymentProcessor')
      expect(result).toContain('def process(self, payment)')
    })

    it('keeps docstrings', async () => {
      const result = await trimCluster(['src/views.py'], tempDir)

      expect(result).toContain('Create a new payment record')
    })

    it('strips function bodies', async () => {
      const result = await trimCluster(['src/views.py'], tempDir)

      expect(result).not.toContain('Payment.objects.create')
      expect(result).not.toContain('Payment.objects.get')
      expect(result).not.toContain('self.client.charge')
    })
  })

  describe('Java trimming', () => {
    it('keeps package, imports, class declaration, and method signatures', async () => {
      const result = await trimCluster(['src/UserService.java'], tempDir)

      expect(result).toContain('package com.example.users')
      expect(result).toContain('import java.util.List')
      expect(result).toContain('public class UserService')
      expect(result).toContain('public User createUser')
      expect(result).toContain('public Optional<User> findById')
      expect(result).toContain('public interface UserRepository')
    })

    it('strips method bodies', async () => {
      const result = await trimCluster(['src/UserService.java'], tempDir)

      expect(result).not.toContain('userRepository.save')
      expect(result).not.toContain('emailService.sendWelcome')
      expect(result).not.toContain('sendGoodbye')
    })
  })

  describe('multi-file cluster', () => {
    it('combines multiple files with headers', async () => {
      const result = await trimCluster(
        ['src/billing.service.ts', 'src/types.ts'],
        tempDir,
      )

      expect(result).toContain('// === src/billing.service.ts ===')
      expect(result).toContain('// === src/types.ts ===')
    })

    it('respects the 300-line limit', async () => {
      const result = await trimCluster(
        ['src/billing.service.ts', 'src/views.py', 'src/UserService.java', 'src/types.ts'],
        tempDir,
      )

      const lineCount = result.split('\n').length
      // Should stay within MAX_CLUSTER_LINES (300) + some tolerance for headers
      expect(lineCount).toBeLessThanOrEqual(310)
    })

    it('includes smaller files first (sorts by line count)', async () => {
      const result = await trimCluster(
        ['src/billing.service.ts', 'src/types.ts'],
        tempDir,
      )

      const typesIdx = result.indexOf('// === src/types.ts ===')
      const billingIdx = result.indexOf('// === src/billing.service.ts ===')

      // types.ts is smaller, should appear first
      expect(typesIdx).toBeLessThan(billingIdx)
    })
  })

  describe('edge cases', () => {
    it('handles missing files gracefully', async () => {
      const result = await trimCluster(['src/nonexistent.ts'], tempDir)
      expect(result.trim()).toBe('')
    })

    it('handles empty paths array', async () => {
      const result = await trimCluster([], tempDir)
      expect(result.trim()).toBe('')
    })
  })
})
