-- CreateTable
CREATE TABLE "buy_tokens_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "nonceUsed" INTEGER NOT NULL,
    "playerTokenIds" TEXT NOT NULL,
    "amounts" TEXT NOT NULL,
    "maxCurrencySpend" TEXT NOT NULL,
    "deadline" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "buy_tokens_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
