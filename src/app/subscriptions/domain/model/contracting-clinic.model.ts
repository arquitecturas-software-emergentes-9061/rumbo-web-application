/** Clinic that contracts the subscription, as seen by the subscriptions context. */
export interface ContractingClinic {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  phone: string | null;
}
