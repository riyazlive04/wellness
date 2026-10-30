/**
 * Invoices the client's own practice issued them.
 *
 * Read-only, and deliberately so: the practice collects the money directly,
 * so there is nothing to pay here and nothing for the client to change. The
 * client's job on this screen is to see what they owe, when each part is due,
 * and what has already been received.
 *
 * Shapes mirror the web portal (frontend/src/modules/workspace/api/clients.ts);
 * only the fields this screen actually renders are carried over, because an
 * unused field here is a field that silently drifts from the server.
 */
import { api } from '@/lib/api';

export interface InvoiceItem {
  description: string;
  /** Whole units. A half-consultation is a price change, not a quantity. */
  quantity: number;
  /** Price for ONE unit, in paise. */
  unit_paise: number;
}

export interface PracticeInvoice {
  id: string;
  display_number: string;
  /** Drafts never reach a client; the server filters them out. */
  status: 'sent' | 'paid' | 'void' | 'draft';
  items: InvoiceItem[];
  total_paise: number;
  /** Received so far, across every part-payment. */
  paid_paise: number;
  /** Still owed. Not total minus nothing: a deposit already counts. */
  balance_paise: number;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
}

export interface InvoiceInstalment {
  id: string;
  invoice_id: string;
  /** 1-based: instalment 2 of 3. */
  seq: number;
  amount_paise: number;
  due_at: string;
  /** What was first agreed, once the date has been moved. */
  original_due_at: string | null;
  extended_count: number;
  note: string | null;
  paid_paise: number;
  balance_paise: number;
  /** Due date passed with money still owed. */
  overdue: boolean;
}

export const invoicesApi = {
  mine: () => api.get<PracticeInvoice[]>('/api/v1/me/invoices'),

  /** My own payment schedule for one invoice. Empty when there is no plan. */
  instalments: (id: string) =>
    api.get<InvoiceInstalment[]>(`/api/v1/me/invoices/${id}/instalments`),
};
