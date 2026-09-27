import { Context } from '@netlify/functions';
import {
    getApiKey,
    callGeminiEmbedding,
    cosineSimilarity,
    Paper,
    checkPasscode,
} from './_utils.js';
import { cacheGet, cacheSet } from './shared/redis.js';

const DEFAULT_RESULT_LIMIT = 25;
const MAX_RESULT_LIMIT = 50;
const EMBEDDING_CONCURRENCY = 5;
const PROVIDER_TIMEOUT_MS = 4000;
const RANKING_TIMEOUT_MS = 6000;
const CACHE_TIMEOUT_MS = 400;

async function withDeadline<T>(
    work: (signal: AbortSignal) => Promise<T>,
    parent: AbortSignal,
    milliseconds: number,
): Promise<T> {
    const controller = new AbortController();
    const signal = AbortSignal.any([parent, controller.signal]);
    signal.throwIfAborted();
    const timer = setTimeout(
        () => controller.abort(new DOMException('Search stage timed out', 'TimeoutError')),
        milliseconds,
    );
    let onAbort: () => void = () => {};
    try {
        const interrupted = new Promise<never>((_, reject) => {
            onAbort = () => reject(signal.reason);
            signal.addEventListener('abort', onAbort, { once: true });
        });
        return await Promise.race([work(signal), interrupted]);
    } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
    }
}

class ProviderError extends Error {
    constructor(
        readonly status: number,
        readonly retryAfterMs = 0,
    ) {
        super(`Discovery provider returned HTTP ${status}`);
    }
}

async function discoveryJson(url: string, signal: AbortSignal): Promise<any> {
    const headers: Record<string, string> = { 'User-Agent': 'Evidara Research App' };
    if (
        new URL(url).hostname === 'api.semanticscholar.org' &&
        process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
    )
        headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY.trim();
    if (new URL(url).hostname === 'api.openalex.org' && process.env.OPENALEX_API_KEY?.trim())
        headers.Authorization = `Bearer ${process.env.OPENALEX_API_KEY.trim()}`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await withDeadline(
                async (stageSignal) => {
                    const response = await fetch(url, {
                        headers,
                        signal: stageSignal,
                    });
                    if (!response.ok) {
                        const retryAfter = response.headers?.get('Retry-After') || '';
                        const numeric = Number(retryAfter);
                        const retryAfterMs =
                            retryAfter && Number.isFinite(numeric)
                                ? Math.max(0, numeric * 1000)
                                : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
                        throw new ProviderError(response.status, retryAfterMs);
                    }
                    return await response.json();
                },
                signal,
                PROVIDER_TIMEOUT_MS,
            );
        } catch (error) {
            if (
                signal.aborted ||
                attempt === 1 ||
                (error instanceof ProviderError &&
                    error.status !== 408 &&
                    error.status !== 429 &&
                    error.status < 500) ||
                (error instanceof ProviderError && error.retryAfterMs > 1000)
            )
                throw error;
            const delay =
                error instanceof ProviderError && error.status === 429
                    ? Math.max(1000, error.retryAfterMs)
                    : 250;
            if (!process.env.VITEST) await new Promise((done) => setTimeout(done, delay));
        }
    }
    throw new Error('Discovery request failed');
}

async function optionalCache<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await withDeadline(() => work(), new AbortController().signal, CACHE_TIMEOUT_MS);
    } catch {
        return fallback;
    }
}

export default async (req: Request, context: Context) => {
    // Enable CORS for localhost testing if needed (though Netlify takes care of routing)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const unauthorized = checkPasscode(req.headers);
    if (unauthorized) return unauthorized;

    try {
        const body = (await req.json()) as { query?: unknown; limit?: unknown };
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query) {
            return new Response(JSON.stringify({ message: 'Query parameter is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        const limit = body.limit ?? DEFAULT_RESULT_LIMIT;
        if (
            typeof limit !== 'number' ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > MAX_RESULT_LIMIT
        ) {
            return new Response(
                JSON.stringify({ message: 'Paper limit must be an integer from 1 to 50' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }
        if (query.length > 1000) {
            return new Response(
                JSON.stringify({ message: 'Query must be at most 1000 characters' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        const geminiKey = getApiKey(req.headers, 'gemini');
        const candidateLimit = Math.max(25, limit);

        // Check Redis distributed cache first
        // Version/size/ranking partition prevents old 10-result caches or citation rankings
        // from satisfying a larger or semantically ranked request.
        const cacheKey = `search:v2:${geminiKey ? 'semantic' : 'citations'}:${limit}:${query.toLowerCase()}`;
        const cachedResults = await optionalCache(() => cacheGet<Paper[]>(cacheKey), null);
        if (cachedResults && cachedResults.length > 0) {
            return new Response(
                JSON.stringify({
                    papers: cachedResults.slice(0, limit),
                    resultLimit: limit,
                    fromCache: true,
                }),
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                },
            );
        }

        // 1. Fetch papers from Semantic Scholar search API
        const sScholarUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${candidateLimit}&fields=title,authors,year,abstract,externalIds,citationCount`;

        let papers: Paper[] = [];
        let recordsFound = 0;

        try {
            const data = await discoveryJson(sScholarUrl, req.signal);
            if (!Array.isArray(data?.data)) throw new Error('Malformed discovery response');
            const ssData = data.data;
            recordsFound += ssData.length;

            papers = ssData
                .map((item: any) => ({
                    id: item.paperId || Math.random().toString(36).substr(2, 9),
                    title: item.title || '',
                    authors: item.authors ? item.authors.map((a: any) => a.name) : [],
                    year: item.year || null,
                    abstract: item.abstract || '',
                    doi: item.externalIds ? item.externalIds.DOI : undefined,
                    citations: item.citationCount || 0,
                }))
                .filter((p: Paper) => p.abstract.length > 30); // only keep papers with abstracts
        } catch (err) {
            console.error('Semantic Scholar search error:', err);
        }
        // Empty/abstractless primary results also need a second source in the same request.
        if (papers.length === 0) {
            console.log('Searching OpenAlex as fallback...');
            const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${candidateLimit}`;
            try {
                const data = await discoveryJson(openAlexUrl, req.signal);
                if (!Array.isArray(data?.results))
                    throw new Error('Malformed fallback discovery response');
                recordsFound += data.results.length;
                papers = data.results
                    .map((item: any) => {
                        const abstractObj = item.abstract_inverted_index || {};
                        // Reconstruct abstract from inverted index
                        let abstract = '';
                        try {
                            const words: string[] = [];
                            Object.keys(abstractObj).forEach((word) => {
                                abstractObj[word].forEach((pos: number) => {
                                    words[pos] = word;
                                });
                            });
                            abstract = words.join(' ');
                        } catch (e) {
                            abstract = '';
                        }

                        return {
                            id: item.id || Math.random().toString(36).substr(2, 9),
                            title: item.display_name || '',
                            authors: item.authorships
                                ? item.authorships.map((a: any) => a.author.display_name)
                                : [],
                            year: item.publication_year || null,
                            abstract: abstract,
                            doi: item.doi ? item.doi.replace('https://doi.org/', '') : undefined,
                            citations: item.cited_by_count || 0,
                        };
                    })
                    .filter((p: Paper) => p.abstract.length > 30);
            } catch (error) {
                const rateLimited = error instanceof ProviderError && error.status === 429;
                return new Response(
                    JSON.stringify({
                        code: rateLimited ? 'SEARCH_RATE_LIMITED' : 'SEARCH_UNAVAILABLE',
                        message: rateLimited
                            ? 'Paper search providers are rate-limited. Please wait before trying again.'
                            : 'Paper search is temporarily unavailable. Please try again shortly.',
                    }),
                    {
                        status: 503,
                        headers: {
                            'Content-Type': 'application/json',
                            'Retry-After': String(
                                rateLimited
                                    ? Math.max(60, Math.ceil(error.retryAfterMs / 1000))
                                    : 1,
                            ),
                        },
                    },
                );
            }
        }

        papers = papers.slice(0, candidateLimit);
        if (papers.length === 0) {
            return new Response(
                JSON.stringify({
                    papers: [],
                    resultLimit: limit,
                    emptyReason: recordsFound ? 'NO_USABLE_ABSTRACTS' : 'NO_MATCHES',
                }),
                {
                    headers: { 'Content-Type': 'application/json' },
                },
            );
        }

        // 2. Vector re-ranking if Gemini API key is available
        let rankingCompleted = !geminiKey;
        if (geminiKey) {
            try {
                const ranked = await withDeadline(
                    async (rankingSignal) => {
                        const queryVector = await callGeminiEmbedding(
                            query,
                            geminiKey,
                            rankingSignal,
                        );
                        // Bound concurrent embedding requests as the result pool grows.
                        const scoredPapers: { paper: Paper; score: number }[] = new Array(
                            papers.length,
                        );
                        let nextIndex = 0;
                        const worker = async () => {
                            while (nextIndex < papers.length) {
                                rankingSignal.throwIfAborted();
                                const index = nextIndex++;
                                const paper = papers[index];
                                try {
                                    const textToEmbed = `${paper.title}. ${paper.abstract}`;
                                    const vector = await callGeminiEmbedding(
                                        textToEmbed,
                                        geminiKey,
                                        rankingSignal,
                                    );
                                    const score = cosineSimilarity(queryVector, vector);
                                    scoredPapers[index] = { paper, score };
                                } catch (e) {
                                    // fallback score
                                    scoredPapers[index] = { paper, score: 0 };
                                }
                            }
                        };
                        await Promise.all(
                            Array.from(
                                { length: Math.min(EMBEDDING_CONCURRENCY, papers.length) },
                                worker,
                            ),
                        );

                        // Sort by score descending
                        scoredPapers.sort((a, b) => b.score - a.score);
                        return scoredPapers.map((sp) => sp.paper);
                    },
                    req.signal,
                    RANKING_TIMEOUT_MS,
                );
                papers = ranked;
                rankingCompleted = true;
            } catch (err) {
                console.error('Vector re-ranking failed:', err);
                // Fallback to sorting by citation count + relevance
                papers.sort((a, b) => b.citations - a.citations);
            }
        } else {
            // No Gemini API Key: Fallback to sorting by citations count
            papers.sort((a, b) => b.citations - a.citations);
        }

        const finalPapers = papers.slice(0, limit);

        // Complete the cache write before the serverless invocation ends.
        if (rankingCompleted)
            await optionalCache(() => cacheSet(cacheKey, finalPapers, 86400), false);

        return new Response(JSON.stringify({ papers: finalPapers, resultLimit: limit }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error: any) {
        console.error('Global search error handler:', error);
        return new Response(JSON.stringify({ message: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
};

export const config = {
    path: '/api/search',
};
