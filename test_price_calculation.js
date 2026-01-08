// Test script for price calculation logic
const { getApplicableMaterialPrice } = require('./src/utils/priceCalculator.ts');

// Test data
const prices = [
  {
    id: '1',
    material_id: 'mat1',
    unit_price: 22.6,
    effective_start_date: '2025-11-24',
    effective_end_date: null,
    created_at: '2025-11-24T02:24:21.105088+00:00',
    updated_at: '2025-11-24T02:24:21.105088+00:00'
  },
  {
    id: '2',
    material_id: 'mat1',
    unit_price: 25.5,
    effective_start_date: '2025-06-07',
    effective_end_date: '2025-12-31',
    created_at: '2025-11-24T02:42:40.61955+00:00',
    updated_at: '2025-11-24T02:42:40.61955+00:00'
  }
];

// Test cases
console.log('=== Price Calculation Tests ===');

// Test 1: Receiving date in historical period
const price1 = getApplicableMaterialPrice(prices, '2025-08-15');
console.log('Test 1 - Receiving date 2025-08-15 (historical period):', price1, 'Expected: 25.5');

// Test 2: Receiving date in current period
const price2 = getApplicableMaterialPrice(prices, '2025-11-25');
console.log('Test 2 - Receiving date 2025-11-25 (current period):', price2, 'Expected: 22.6');

// Test 3: No receiving date (should use latest price)
const price3 = getApplicableMaterialPrice(prices, undefined);
console.log('Test 3 - No receiving date (latest price):', price3, 'Expected: 22.6');

// Test 4: Receiving date before any price period
const price4 = getApplicableMaterialPrice(prices, '2025-01-01');
console.log('Test 4 - Receiving date 2025-01-01 (before any period):', price4, 'Expected: 0');

console.log('=== Tests Complete ===');