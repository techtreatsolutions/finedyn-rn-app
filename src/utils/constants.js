export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  WAITER: 'waiter',
  KITCHEN_STAFF: 'kitchen_staff',
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PARTIAL: 'partial',
  PAID: 'paid',
};

export const TABLE_STATUS = {
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  RESERVED: 'reserved',
  CLEANING: 'cleaning',
};

export const ROLE_REDIRECT = {
  owner: 'AdminDrawer',
  manager: 'AdminDrawer',
  cashier: 'POSTabs',
  waiter: 'WaiterDashboard',
  kitchen_staff: 'KDS',
};
