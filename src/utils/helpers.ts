/** Текущая дата UTC (YYYY-MM-DD) */
export const getTodayDate = (): string => new Date().toISOString().split('T')[0];

/** Удаляет самые старые записи из Map, если размер превышает лимит */
export const enforceMapLimit = <K, V>(map: Map<K, V>, max: number): void => {
    if (map.size <= max) return;
    const toDelete = Array.from(map.keys()).slice(0, map.size - max);
    toDelete.forEach((k) => map.delete(k));
};

/** Экранирует спецсимволы Markdown (_ * [ `) — для имён и любого чужого текста */
export const escapeMarkdown = (text: string): string => text.replace(/([_*\[`])/g, '\\$1');
