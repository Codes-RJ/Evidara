import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    key: '',
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    embedding: vi.fn(),
}));
vi.mock('../shared/redis.js', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));
vi.mock('../_utils.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../_utils.js')>();
    return {
        ...actual,
        getApiKey: () => mocks.key,
        callGeminiEmbedding: mocks.embedding,
        retryWithBackoff: async (work: () => Promise<unknown>) => work(),
    };
});
import search from '../search.js';

const candidates = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        paperId: `paper-${i}`,
        title: `Paper ${i}`,
        authors: [],
        year: 2026,
        abstract:
            'A complete research abstract with sufficient text for the academic search filter.',
        citationCount: i,
    }));
const request = (body: unknown) =>
    new Request('http://localhost/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
describe('Search result limits', () => {
    afterEach(() => vi.unstubAllEnvs());
    beforeEach(() => {
        vi.stubEnv('SEMANTIC_SCHOLAR_API_KEY', '');
        vi.stubEnv('OPENALEX_API_KEY', '');
        vi.resetAllMocks();
        mocks.key = '';
        mocks.cacheGet.mockResolvedValue(null);
        mocks.cacheSet.mockResolvedValue(true);
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: candidates(70) }) }),
        );
    });
    it('returns up to 25 by default using the existing candidate-pool size', async () => {
        const result = await search(request({ query: ' Topic ' }), {} as never);
        const data = await result.json();
        expect(data.papers).toHaveLength(25);
        expect(data.resultLimit).toBe(25);
        expect(data.papers[0].id).toBe('paper-24');
        expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams.get('limit')).toBe(
            '25',
        );
        expect(mocks.cacheSet).toHaveBeenCalledWith(
            'search:v2:citations:25:topic',
            data.papers,
            86400,
        );
    });
    it.each([10, 25, 50])(
        'honors a requested limit of %i and bounds upstream candidates',
        async (limit) => {
            const response = await search(request({ query: 'topic', limit }), {} as never);
            const data = await response.json();
            expect(data.papers).toHaveLength(limit);
            expect(data.resultLimit).toBe(limit);
            expect(
                new URL(vi.mocked(fetch).mock.calls[0][0] as string).searchParams.get('limit'),
            ).toBe(String(Math.max(25, limit)));
        },
    );
    it.each([0, -1, 51, 2.5, '50', {}])(
        'rejects invalid result limits before contacting providers: %j',
        async (limit) => {
            const response = await search(request({ query: 'topic', limit }), {} as never);
            expect(response.status).toBe(400);
            expect(fetch).not.toHaveBeenCalled();
            expect(mocks.cacheGet).not.toHaveBeenCalled();
        },
    );
    it('uses the larger candidate limit for OpenAlex fallback', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce({ ok: false, status: 400 } as Response)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    results: candidates(50).map((p) => ({
                        id: p.paperId,
                        display_name: p.title,
                        abstract_inverted_index: {
                            Complete: [0],
                            research: [1],
                            abstract: [2],
                            describing: [3],
                            important: [4],
                            findings: [5],
                        },
                    })),
                }),
            } as Response);
        const response = await search(request({ query: 'topic', limit: 50 }), {} as never);
        expect((await response.json()).papers).toHaveLength(50);
        expect(
            new URL(vi.mocked(fetch).mock.calls[1][0] as string).searchParams.get('per_page'),
        ).toBe('50');
    });
    it('partitions cached results by requested size and ranking mode', async () => {
        const papers = candidates(50).map((p) => ({
            id: p.paperId,
            title: p.title,
            authors: [],
            year: p.year,
            abstract: p.abstract,
            citations: p.citationCount,
        }));
        mocks.cacheGet.mockResolvedValue(papers);
        const first = await search(request({ query: 'topic', limit: 10 }), {} as never);
        expect((await first.json()).papers).toHaveLength(10);
        mocks.key = 'synthetic-key';
        await search(request({ query: 'topic', limit: 50 }), {} as never);
        expect(mocks.cacheGet.mock.calls.map(([key]) => key)).toEqual([
            'search:v2:citations:10:topic',
            'search:v2:semantic:50:topic',
        ]);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('limits embedding concurrency to five while ranking every candidate', async () => {
        mocks.key = 'synthetic-key';
        let active = 0;
        let peak = 0;
        mocks.embedding.mockImplementation(async (text: string) => {
            if (text === 'topic') return [1, 0];
            active++;
            peak = Math.max(peak, active);
            await new Promise((done) => setTimeout(done, 2));
            active--;
            return [1, 0];
        });
        const response = await search(request({ query: 'topic', limit: 50 }), {} as never);
        expect((await response.json()).papers).toHaveLength(50);
        expect(mocks.embedding).toHaveBeenCalledTimes(51);
        expect(peak).toBe(5);
    });
    it('returns fewer results when abstracts are unavailable', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [...candidates(2), { ...candidates(1)[0], abstract: '' }] }),
        } as Response);
        const response = await search(request({ query: 'topic', limit: 50 }), {} as never);
        expect((await response.json()).papers).toHaveLength(2);
    });
    it('finds fallback papers on the first request when the primary returns no records', async () => {
        vi.mocked(fetch).mockImplementation(
            async (url) =>
                ({
                    ok: true,
                    json: async () =>
                        String(url).includes('semanticscholar')
                            ? { data: [] }
                            : {
                                  results: [
                                      {
                                          id: 'fallback-1',
                                          display_name: 'Fallback research',
                                          abstract_inverted_index: {
                                              Complete: [0],
                                              research: [1],
                                              abstract: [2],
                                              describing: [3],
                                              important: [4],
                                              findings: [5],
                                          },
                                      },
                                  ],
                              },
                }) as Response,
        );
        const response = await search(request({ query: 'topic' }), {} as never);
        expect(response.status).toBe(200);
        expect((await response.json()).papers[0].id).toBe('fallback-1');
    });
    it('recovers a transient fallback failure within the first user search', async () => {
        let fallbackCalls = 0;
        vi.mocked(fetch).mockImplementation(async (url) => {
            if (String(url).includes('semanticscholar'))
                return { ok: false, status: 400 } as Response;
            if (++fallbackCalls === 1) return { ok: false, status: 503 } as Response;
            return {
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 'recovered-1',
                            display_name: 'Recovered research',
                            abstract_inverted_index: {
                                Complete: [0],
                                research: [1],
                                abstract: [2],
                                describing: [3],
                                important: [4],
                                findings: [5],
                            },
                        },
                    ],
                }),
            } as Response;
        });
        const response = await search(request({ query: 'topic' }), {} as never);
        expect(response.status).toBe(200);
        expect((await response.json()).papers[0].id).toBe('recovered-1');
        expect(fallbackCalls).toBe(2);
    });
    it('reports provider failure instead of a successful empty literature result', async () => {
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
        const response = await search(request({ query: 'topic' }), {} as never);
        expect(response.status).toBe(503);
        expect(mocks.cacheSet).not.toHaveBeenCalled();
    });
    it('falls back when primary records have no usable abstracts', async () => {
        vi.mocked(fetch).mockImplementation(
            async (url) =>
                ({
                    ok: true,
                    json: async () =>
                        String(url).includes('semanticscholar')
                            ? { data: [{ ...candidates(1)[0], abstract: null }] }
                            : {
                                  results: [
                                      {
                                          id: 'abstract-1',
                                          display_name: 'Research with abstract',
                                          abstract_inverted_index: {
                                              Complete: [0],
                                              research: [1],
                                              abstract: [2],
                                              describing: [3],
                                              important: [4],
                                              findings: [5],
                                          },
                                      },
                                  ],
                              },
                }) as Response,
        );
        const response = await search(request({ query: 'Open Knowledge Format' }), {} as never);
        expect((await response.json()).papers[0].id).toBe('abstract-1');
    });
    it('does not let stalled optional cache reads or writes block the first search', async () => {
        vi.useFakeTimers();
        try {
            mocks.cacheGet.mockImplementation(() => new Promise(() => {}));
            mocks.cacheSet.mockImplementation(() => new Promise(() => {}));
            const pending = search(request({ query: 'topic' }), {} as never);
            await vi.advanceTimersByTimeAsync(401);
            expect(fetch).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(401);
            expect((await (await pending).json()).papers).toHaveLength(25);
        } finally {
            vi.useRealTimers();
        }
    });
    it('returns discovered papers if cold semantic ranking stalls', async () => {
        vi.useFakeTimers();
        try {
            mocks.key = 'synthetic-key';
            mocks.embedding.mockImplementation(() => new Promise(() => {}));
            const pending = search(request({ query: 'topic' }), {} as never);
            await vi.advanceTimersByTimeAsync(6001);
            const response = await pending;
            const data = await response.json();
            expect(response.status).toBe(200);
            expect(data.papers).toHaveLength(25);
            expect(data.papers[0].id).toBe('paper-24');
            expect(mocks.embedding.mock.calls[0][2].aborted).toBe(true);
            expect(mocks.cacheSet).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
    it('moves to fallback within the first search if the primary provider stalls', async () => {
        vi.useFakeTimers();
        try {
            vi.mocked(fetch).mockImplementation(async (url) => {
                if (String(url).includes('semanticscholar')) return new Promise(() => {});
                return {
                    ok: true,
                    json: async () => ({
                        results: [
                            {
                                id: 'timely-1',
                                display_name: 'Available research',
                                abstract_inverted_index: {
                                    Complete: [0],
                                    research: [1],
                                    abstract: [2],
                                    describing: [3],
                                    important: [4],
                                    findings: [5],
                                },
                            },
                        ],
                    }),
                } as Response;
            });
            const pending = search(request({ query: 'topic' }), {} as never);
            await vi.advanceTimersByTimeAsync(8001);
            expect((await (await pending).json()).papers[0].id).toBe('timely-1');
        } finally {
            vi.useRealTimers();
        }
    });
    it('keeps a genuine empty result distinct from provider failure', async () => {
        vi.mocked(fetch).mockImplementation(
            async (url) =>
                ({
                    ok: true,
                    json: async () =>
                        String(url).includes('semanticscholar') ? { data: [] } : { results: [] },
                }) as Response,
        );
        const response = await search(request({ query: 'topic' }), {} as never);
        expect(response.status).toBe(200);
        expect((await response.json()).papers).toEqual([]);
    });
    it('uses server discovery credentials only for the intended provider', async () => {
        vi.stubEnv('SEMANTIC_SCHOLAR_API_KEY', 'synthetic-scholar-key');
        vi.stubEnv('OPENALEX_API_KEY', 'synthetic-alex-key');
        vi.mocked(fetch).mockImplementation(async (url) =>
            String(url).includes('semanticscholar')
                ? ({ ok: false, status: 400 } as Response)
                : ({ ok: true, json: async () => ({ results: [] }) } as Response),
        );
        await search(request({ query: 'topic' }), {} as never);
        expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({
            'x-api-key': 'synthetic-scholar-key',
        });
        expect(vi.mocked(fetch).mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
        expect(vi.mocked(fetch).mock.calls[1][1]?.headers).toMatchObject({
            Authorization: 'Bearer synthetic-alex-key',
        });
        expect(vi.mocked(fetch).mock.calls[1][1]?.headers).not.toHaveProperty('x-api-key');
        expect(
            vi
                .mocked(fetch)
                .mock.calls.map(([url]) => String(url))
                .join(' '),
        ).not.toContain('synthetic-');
    });
    it('respects provider cooldowns and returns a rate-limit error without false empty results', async () => {
        vi.mocked(fetch).mockImplementation(async (url) =>
            String(url).includes('semanticscholar')
                ? ({ ok: false, status: 400 } as Response)
                : ({
                      ok: false,
                      status: 429,
                      headers: new Headers({ 'Retry-After': '120' }),
                  } as Response),
        );
        const response = await search(request({ query: 'Open Knowledge Format' }), {} as never);
        expect(response.status).toBe(503);
        expect(response.headers.get('Retry-After')).toBe('120');
        expect((await response.json()).code).toBe('SEARCH_RATE_LIMITED');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(mocks.cacheSet).not.toHaveBeenCalled();
    });
    it('distinguishes missing abstracts from no matching records', async () => {
        vi.mocked(fetch).mockImplementation(
            async (url) =>
                ({
                    ok: true,
                    json: async () =>
                        String(url).includes('semanticscholar')
                            ? { data: [{ ...candidates(1)[0], abstract: '' }] }
                            : {
                                  results: [
                                      {
                                          id: 'metadata-only',
                                          display_name: 'Metadata without abstract',
                                          abstract_inverted_index: null,
                                      },
                                  ],
                              },
                }) as Response,
        );
        const response = await search(request({ query: 'topic' }), {} as never);
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.papers).toEqual([]);
        expect(data.emptyReason).toBe('NO_USABLE_ABSTRACTS');
    });
});
