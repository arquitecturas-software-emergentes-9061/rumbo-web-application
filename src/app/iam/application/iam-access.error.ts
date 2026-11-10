export class IamAccessError extends Error {
  constructor(readonly status: number, readonly error?: { code: string }) {
    super(error?.code ?? `IAM access error ${status}`);
  }
}
