export const branchMetrics = [
  { id: 1, name: 'Synthetic Laguna', is_active: 1, appointments: 4, pending: 1, completed: 2, no_shows: 1, doctors: 1, billed: 900, collected: 500 },
  { id: 2, name: 'Synthetic Manila', is_active: 1, appointments: 4, pending: 1, completed: 2, no_shows: 1, doctors: 1, billed: 900, collected: 500 },
]

export function sampleReports(branchName = 'Synthetic Laguna') {
  return {
    overview: { totals: { appointments: 4, completed: 2, unique_patients: 3, no_show_rate: 25, net_collected: 500, outstanding: 75, low_stock: 1, out_of_stock: 1 }, revenue_trend: [{ ym: '2026-11', revenue: 500 }], note: 'Current outstanding is a snapshot.' },
    appointments: { summary: { appointments: 4, unique_patients: 3, new_patients: 2, returning_patients: 1, completed: 2, no_show: 1 }, statuses: [{ name: 'completed', count: 2 }, { name: 'pending', count: 1 }, { name: 'no_show', count: 1 }], sources: [{ name: 'guest_online', count: 1 }], departments: [{ name: 'medical', count: 4 }] },
    financial: { billing: { gross_billed: 1200, net_billed: 900, discounts: 300, promotion_discounts: 100 }, collections: { gross_received: 600, voided: 60, refunded: 40, net_collected: 500 }, payments_by_method: [{ payment_method: 'cash', transactions: 3, gross: 600, voided: 60, refunded: 40, net: 500 }], revenue_trend: [{ ym: '2026-11', revenue: 500 }], promotions: { promotional_bills: 1, promotion_savings: 100 }, outstanding: 75, note: 'Collections use actual payment and refund dates.' },
    services: { doctors: [{ name: 'Dr Synthetic', branch_name: branchName, appointments: 4, patients: 3, completed: 2, no_show: 1 }], services: [{ name: 'Synthetic Consultation', branch_name: branchName, bills: 2, quantity: 2, gross_billed: 900 }], promotions: [{ name: 'Synthetic Offer', branch_name: branchName, bills: 1, discounts: 100 }] },
    inventory: { summary: { products: 2, low_stock: 1, out_of_stock: 1, estimated_selling_value: 76.5 }, categories: [{ name: 'medical', products: 2, estimated_selling_value: 76.5 }], most_used: [{ branch_id: 1, name: 'Synthetic Medicine', unit: 'unit', quantity: 4 }], movements: [{ name: 'stock_out', actions: 1, quantity: 4 }], stockrooms: [{ branch_name: branchName, name: 'Main Stockroom', location_type: 'main', products: 2, quantity: 3 }], as_of: '2026-11-12', note: 'Stock is the current snapshot, not a historical balance.' },
  }
}
