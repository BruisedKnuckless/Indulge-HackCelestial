import { FeeCalculationService, rupeesToPaise, paiseToRupees } from './src/services/fee-calculation.service.js';

function assertEqual(actual, expected, desc) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`FAIL: ${desc} -> Expected ${expected}, got ${actual}`);
  }
  console.log(`✓ PASS: ${desc} -> ${actual}`);
}

console.log('=== TEST SUITE: INDULGE PAYMENT, WALLET & SETTLEMENT ===\n');

// 1. SCENARIO 1: ₹42,000 Orchid Hall (Prompt exact specifications)
console.log('--- Test 1: ₹42,000 Orchid Hall with 18% GST & ₹2,000 logistics ---');
const q1 = FeeCalculationService.calculateBookingFees({
  resourcePrice: 42000,
  quantity: 1,
  logisticsFee: 2000,
  rates: {
    resourceGSTPercent: 18,
    platformFeePercent: 5,
    platformFeeGSTPercent: 18,
    paymentGatewayFeePercent: 2,
    paymentGatewayGSTPercent: 0,
    listerCommissionPercent: 3,
    listerCommissionGSTPercent: 18
  }
});

assertEqual(q1.resourceSubtotal, 42000, 'Resource subtotal');
assertEqual(q1.resourceGST, 7560, 'Resource GST (18%)');
assertEqual(q1.platformFee, 2100, 'Seeker platform fee (5%)');
assertEqual(q1.platformFeeGST, 378, 'GST on platform fee (18% of ₹2,100)');
assertEqual(q1.paymentGatewayFee, 840, 'Payment processing fee (2%)');
assertEqual(q1.logisticsFee, 2000, 'Logistics charge');
assertEqual(q1.total, 54878, 'Total seeker payable');

// Lister settlement check
assertEqual(q1.listerSettlement.grossAmount, 42000, 'Lister gross');
assertEqual(q1.listerSettlement.commissionAmount, 1260, 'Lister 3% commission');
assertEqual(q1.listerSettlement.commissionGST, 226.8, 'GST on 3% commission (18%)');
assertEqual(q1.listerSettlement.netPayout, 40513.2, 'Lister net payout (₹42,000 - ₹1,260 - ₹226.80)');
assertEqual(q1.listerSettlement.netPayoutPaise, 4051320, 'Lister net payout in paise (integer precision)');

// 2. SCENARIO 2: ₹9,000 banquet chairs with 12% GST and free self pickup
console.log('\n--- Test 2: ₹9,000 banquet chairs with 12% GST & ₹0 logistics ---');
const q2 = FeeCalculationService.calculateBookingFees({
  resourcePrice: 9000,
  quantity: 1,
  logisticsFee: 0,
  rates: {
    resourceGSTPercent: 12,
    platformFeePercent: 5,
    platformFeeGSTPercent: 18,
    paymentGatewayFeePercent: 2,
    paymentGatewayGSTPercent: 0,
    listerCommissionPercent: 3,
    listerCommissionGSTPercent: 18
  }
});

assertEqual(q2.resourceSubtotal, 9000, 'Chair subtotal');
assertEqual(q2.resourceGST, 1080, 'Resource GST (12% of ₹9,000)');
assertEqual(q2.platformFee, 450, 'Platform fee (5% of ₹9,000)');
assertEqual(q2.platformFeeGST, 81, 'GST on platform fee (18% of ₹450)');
assertEqual(q2.paymentGatewayFee, 180, 'Payment processing fee (2% of ₹9,000)');
assertEqual(q2.total, 10791, 'Total seeker payable');
assertEqual(q2.listerSettlement.commissionAmount, 270, 'Lister 3% commission');
assertEqual(q2.listerSettlement.commissionGST, 48.6, 'GST on commission (18% of ₹270)');
assertEqual(q2.listerSettlement.netPayout, 8681.4, 'Lister net payout (₹9,000 - ₹270 - ₹48.60)');

// 3. SCENARIO 3: ₹85,000 banquet booking with 28% GST & ₹3,500 premium transport
console.log('\n--- Test 3: ₹85,000 banquet booking with 28% GST & ₹3,500 logistics ---');
const q3 = FeeCalculationService.calculateBookingFees({
  resourcePrice: 85000,
  quantity: 1,
  logisticsFee: 3500,
  rates: {
    resourceGSTPercent: 28,
    platformFeePercent: 5,
    platformFeeGSTPercent: 18,
    paymentGatewayFeePercent: 2,
    paymentGatewayGSTPercent: 0,
    listerCommissionPercent: 3,
    listerCommissionGSTPercent: 18
  }
});

assertEqual(q3.resourceSubtotal, 85000, 'Banquet subtotal');
assertEqual(q3.resourceGST, 23800, 'Resource GST (28% of ₹85,000)');
assertEqual(q3.platformFee, 4250, 'Platform fee (5% of ₹85,000)');
assertEqual(q3.platformFeeGST, 765, 'GST on platform fee (18% of ₹4,250)');
assertEqual(q3.paymentGatewayFee, 1700, 'Payment gateway fee (2% of ₹85,000)');
assertEqual(q3.logisticsFee, 3500, 'Logistics');
assertEqual(q3.total, 119015, 'Total seeker payable');
assertEqual(q3.listerSettlement.commissionAmount, 2550, 'Lister 3% commission');
assertEqual(q3.listerSettlement.commissionGST, 459, 'GST on commission (18% of ₹2,550)');
assertEqual(q3.listerSettlement.netPayout, 81991, 'Lister net payout (₹85,000 - ₹2,550 - ₹459)');

// 4. SCENARIO 4: Paise precision & edge cases
console.log('\n--- Test 4: Paise precision & floating point integrity ---');
assertEqual(rupeesToPaise(40513.2), 4051320, '₹40,513.20 to paise integer');
assertEqual(paiseToRupees(4051320), 40513.2, '4051320 paise back to rupees');
assertEqual(rupeesToPaise(0.01), 1, '1 paisa conversion');
assertEqual(paiseToRupees(1), 0.01, '1 paisa back to rupees');

console.log('\n=== ALL FINANCIAL LOGIC TESTS PASSED! ===');
