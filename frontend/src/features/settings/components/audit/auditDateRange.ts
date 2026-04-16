export const buildAuditDateRangeQuery = (startDate: string, endDate: string) => ({
  startDate: startDate ? new Date(startDate).toISOString() : undefined,
  endDate: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined,
})
