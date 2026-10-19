import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { ingestionRouter } from "./ingestion.js";
import { statementsRouter } from "./statements.js";
import { contractsRouter } from "./contracts.js";
import { catalogRouter } from "./catalog.js";
import { itemsRouter } from "./items.js";
import { reconciliationRouter } from "./reconciliation.js";
import { payoutsRouter } from "./payouts.js";
import { payeesRouter } from "./payees.js";
import { settingsRouter } from "./settings.js";
import { transactionsRouter } from "./transactions.js";
import { dashboardRouter } from "./dashboard.js";
import { payeePortalRouter } from "./payeePortal.js";

export const appRouter = router({
  auth: authRouter,
  ingestion: ingestionRouter,
  statements: statementsRouter,
  contracts: contractsRouter,
  catalog: catalogRouter,
  items: itemsRouter,
  reconciliation: reconciliationRouter,
  payouts: payoutsRouter,
  payees: payeesRouter,
  settings: settingsRouter,
  transactions: transactionsRouter,
  dashboard: dashboardRouter,
  payeePortal: payeePortalRouter,
});

export type AppRouter = typeof appRouter;
