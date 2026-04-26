-- Migrate money fields from integer paise (1/100 of ₹1) to float rupees (₹12.50 = 12.50)
-- PaymentOrder.amount and refundedAmount were stored as integer paise; divide by 100 on upgrade.

ALTER TABLE "paymentOrders"
  ALTER COLUMN "amount" TYPE DOUBLE PRECISION
    USING ("amount"::DOUBLE PRECISION / 100.0);

ALTER TABLE "paymentOrders"
  ALTER COLUMN "refundedAmount" TYPE DOUBLE PRECISION
    USING ("refundedAmount"::DOUBLE PRECISION / 100.0);
