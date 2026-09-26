/**
 * Demonstration inputs: the four required test products plus a MacBook to
 * show that two laptops get different protocols. Used by `npm run
 * inspect:demo` and the verify suite.
 */
export const DEMO_CASES = [
  {
    key: 'dell_latitude_5420',
    input: {
      productName: 'Dell Latitude 5420',
      category: 'Laptop',
      brand: 'Dell',
      model: 'Latitude 5420',
      description: 'Used for office work, well maintained.',
      declaredCondition: 'Excellent',
      usageAge: '2 years',
      specifications: { cpu: 'Intel i5', ram: '16GB', storage: '512GB SSD' },
    },
  },
  {
    key: 'iphone_14',
    input: {
      productName: 'iPhone 14',
      category: 'Mobile Phone',
      brand: 'Apple',
      model: 'iPhone 14',
      declaredCondition: 'Good',
      specifications: { storage: '128GB', 'battery health': '90%' },
    },
  },
  {
    key: 'toyota_innova',
    input: {
      productName: 'Toyota Innova',
      category: 'Vehicle',
      brand: 'Toyota',
      model: 'Innova',
      description: 'Used, good condition.',
      declaredCondition: 'Good',
      specifications: { transmission: 'Automatic', seats: '7' },
    },
  },
  {
    key: 'banquet_chairs_50',
    input: {
      productName: '50 Banquet Chairs',
      category: 'Furniture',
      description: 'Used, good condition.',
      declaredCondition: 'Good',
      quantity: 50,
      specifications: { material: 'Wooden' },
    },
  },
  {
    key: 'macbook_pro_14_m3_pro',
    input: {
      productName: 'MacBook Pro 14 M3 Pro',
      category: 'Laptop',
      brand: 'Apple',
      model: 'MacBook Pro 14-inch (M3 Pro)',
      declaredCondition: 'Excellent',
      specifications: { chip: 'Apple M3 Pro', memory: '18GB', storage: '512GB SSD' },
      accessories: ['96W USB-C power adapter', 'USB-C to MagSafe 3 cable'],
    },
  },
];
