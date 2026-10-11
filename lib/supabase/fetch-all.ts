/** PostgREST caps every response at max_rows (1,000); page through with range(). */
export const POSTGREST_PAGE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += POSTGREST_PAGE) {
    const { data, error } = await page(from, from + POSTGREST_PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < POSTGREST_PAGE) return out;
  }
}
