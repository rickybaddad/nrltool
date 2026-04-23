export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export function isDatabaseConnectivityError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /prisma|database|connection|connect|p1001|p1002|p1017/i.test(error.message);
}
