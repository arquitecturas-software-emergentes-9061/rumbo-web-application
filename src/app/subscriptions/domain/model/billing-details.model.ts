export interface BillingDetails {
  legalName: string;
  ruc: string;
  fiscalAddress: string;
  billingEmail: string;
  purchaseOrder?: string | null;
}
