// ============================================================================
// EVENT BUS — Architecture Event-Driven (Pub/Sub)
// Synchronisation des 27 modules sans couplage direct
// Chaque module émet des événements de domaine, les autres s'abonnent
// ============================================================================

export type DomainEventType =
  // Achats
  | "invoice.supplier.received" | "invoice.supplier.controlled" | "invoice.supplier.approved" | "invoice.supplier.posted"
  // Ventes
  | "invoice.client.created" | "invoice.client.sent" | "quote.accepted" | "deposit.created"
  // Trésorerie
  | "bank.transaction.imported" | "bank.reconciliation.matched" | "check.received" | "check.cashed"
  | "mobilemoney.transaction.imported" | "mobilemoney.transaction.reconciled"
  // Paie
  | "payslip.generated" | "payslip.validated" | "salary.transferred"
  // Immobilisations
  | "asset.acquired" | "asset.depreciated" | "asset.disposed"
  // Fiscalité
  | "tax.declaration.due" | "brs.declared" | "vrs.declared" | "vat.declared" | "dsf.generated"
  // Clôture
  | "period.opened" | "period.closed" | "entry.posted" | "entry.reversed"
  // Audit
  | "audit.anomaly.detected" | "audit.revision.completed";

export type DomainEvent = {
  type: DomainEventType;
  payload: Record<string, unknown>;
  companyId: string;
  timestamp: string;
};

type EventHandler = (event: DomainEvent) => Promise<void>;

class EventBus {
  private handlers: Map<DomainEventType, EventHandler[]> = new Map();
  private history: DomainEvent[] = [];

  /** S'abonner à un ou plusieurs événements */
  subscribe(eventType: DomainEventType, handler: EventHandler): () => void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    // Retourne une fonction de désabonnement
    return () => {
      const filtered = (this.handlers.get(eventType) ?? []).filter((h) => h !== handler);
      this.handlers.set(eventType, filtered);
    };
  }

  /** Émettre un événement asynchrone (tous les handlers s'exécutent en parallèle) */
  async emit(event: DomainEvent): Promise<void> {
    event.timestamp = new Date().toISOString();
    this.history.push(event);

    const handlers = this.handlers.get(event.type) ?? [];
    await Promise.allSettled(handlers.map((handler) => handler(event)));
  }

  /** Rejoue le dernier événement d'un type donné */
  getLastEvent(type: DomainEventType): DomainEvent | undefined {
    return [...this.history].reverse().find((e) => e.type === type);
  }

  /** Retourne les 50 derniers événements */
  getHistory(): DomainEvent[] {
    return this.history.slice(-50);
  }
}

// Instance unique (Singleton)
export const eventBus = new EventBus();

// ============================================================================
// EXEMPLES D'ABONNEMENTS (Wiring des modules)
// ============================================================================

// Quand une facture fournisseur est approuvée → générer l'écriture comptable
// eventBus.subscribe("invoice.supplier.approved", async (event) => {
//   const { invoiceId } = event.payload;
//   await createEntryFromInvoice(invoiceId);
//   await eventBus.emit({ type: "entry.posted", payload: { invoiceId, source: "auto" }, companyId: event.companyId });
// });

// Quand un relevé bancaire est importé → lancer le matching automatique
// eventBus.subscribe("bank.transaction.imported", async (event) => {
//   await runAutoMatching();
// });

// Quand une transaction Mobile Money est importée → la rapprocher
// eventBus.subscribe("mobilemoney.transaction.imported", async (event) => {
//   const { transactionId } = event.payload;
//   await reconcileMobileMoney(transactionId);
//   await eventBus.emit({ type: "mobilemoney.transaction.reconciled", payload: { transactionId }, companyId: event.companyId });
// });

// Quand un acompte est créé → notifier le module DSF
// eventBus.subscribe("deposit.created", async (event) => {
//   await updateVatOnDepositsTracking(event.payload);
// });

// Quand une anomalie d'audit est détectée → notifier le dashboard
// eventBus.subscribe("audit.anomaly.detected", async (event) => {
//   await sendNotification({
//     type: "warning",
//     title: "Anomalie de révision détectée",
//     body: event.payload.description as string,
//   });
// });

// Quand la période est clôturée → geler les écritures
// eventBus.subscribe("period.closed", async (event) => {
//   await lockEntriesForPeriod(event.payload.periodId as string);
// });