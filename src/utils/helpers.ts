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

/** Текущие дата (YYYY-MM-DD) и время (ЧЧ:ММ) в указанном часовом поясе */
export const getZonedDateTime = (timeZone: string): { date: string; time: string } => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
};
