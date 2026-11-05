export interface CreateSiteRequest {
  name: string;
  address: string;
  allowDuplicateAddress?: boolean;
}

export interface Site {
  id: string;
  name: string;
  address: string | null;
  clinicId: string | null;
}

export interface CreateFloorRequest {
  number: number;
  name: string;
  description: string;
}

export interface Floor {
  id: string;
  siteId: string;
  number: number;
  name: string;
  description: string | null;
}

export interface ClinicProfile {
  name: string;
  code: string;
  contactEmail: string;
  phone: string | null;
}

export interface ClinicOrganization extends ClinicProfile {
  id: string;
}
