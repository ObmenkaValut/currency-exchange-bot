/** Текущая дата UTC (YYYY-MM-DD) */
export const getTodayDate = (): string => new Date().toISOString().split('T')[0];
