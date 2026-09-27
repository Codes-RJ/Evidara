import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

/* global document, window, localStorage */

// Synthetic API responses are confined to this browser verification, never the product.
const root = resolve('public');
const output = resolve('logs/audit');
await mkdir(output, { recursive: true });
const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
    const path = resolve(
        root,
        `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname)}`,
    );
    if (!path.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
    }
    try {
        res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
        res.end(await readFile(path));
    } catch {
        res.writeHead(404).end();
    }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
const requests = [];
const papers = [
    {
        id: 'p1',
        title: 'Exercise and cognitive decline: a systematic review',
        authors: ['Sarah Mitchell', 'David Chen', 'Emily Roberts'],
        year: 2024,
        venue: 'Journal of Cognitive Neuroscience',
        citations: 142,
        doi: '10.1234/jcn.2024.001',
        abstract:
            'Regular physical activity is associated with slower cognitive decline in older adults. This systematic review examined 42 studies and found consistent benefits for executive function and memory, with variation across exercise types and intensity.',
    },
    {
        id: 'p2',
        title: 'Physical activity and dementia risk: a longitudinal study',
        authors: ['Michael Anderson', 'Laura Wilson'],
        year: 2023,
        venue: 'The Lancet Neurology',
        citations: 89,
        doi: '10.1234/ln.2023.002',
        abstract:
            'A longitudinal study of 12,000 participants found an association between regular physical activity and reduced dementia risk. Results suggest that sustained activity may support cognitive health over time.',
    },
    {
        id: 'p3',
        title: 'Aerobic exercise and memory in older adults',
        authors: ['James Thompson', 'Rachel Lee'],
        year: 2022,
        venue: 'Aging & Mental Health',
        citations: 67,
        doi: '10.1234/amh.2022.003',
        abstract:
            'A randomized trial examined aerobic exercise and memory performance in older adults. Improvements varied by baseline health and adherence, highlighting the importance of individual differences.',
    },
];
const consensus = {
    supportsCount: 2,
    neutralCount: 1,
    contradictsCount: 0,
    summaryText:
        'Most studies suggest that regular physical activity is associated with slower cognitive decline, particularly in older adults. The strength of evidence varies by study design, exercise type, and cognitive outcome.',
    paperStances: { p1: 'supports', p2: 'supports', p3: 'neutral' },
};
const matrix = papers.map((p) => ({
    title: p.title,
    datasetSize: '42 studies',
    methodology: 'Systematic review',
    outcomes: 'Improved cognitive outcomes',
    limitations: 'Heterogeneous study designs',
}));
try {
    browser = await chromium.launch({
        executablePath:
            process.env.EVIDARA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        headless: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1024 },
        reducedMotion: 'reduce',
        acceptDownloads: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/api/**', async (route) => {
        const request = route.request();
        const name = new URL(request.url()).pathname.split('/').pop();
        const body = name === 'pdf-upload' ? null : request.postDataJSON();
        requests.push({ name, body, headers: request.headers() });
        let data;
        if (name === 'search') {
            if (body.query === 'error case') {
                await route.fulfill({
                    status: 503,
                    json: { message: 'Service temporarily unavailable' },
                });
                return;
            }
            if (body.query === 'slow case') await new Promise((done) => setTimeout(done, 300));
            data = {
                papers:
                    body.query === 'empty case'
                        ? []
                        : body.query === 'inert source'
                          ? [
                                {
                                    ...papers[0],
                                    title: '<img src=x onerror="window.injection=true">',
                                    abstract: '<script>window.injection=true</script>',
                                },
                            ]
                          : papers,
            };
        } else if (name === 'consensus') data = consensus;
        else if (name === 'compare') data = { matrix };
        else if (name === 'network-graph')
            data = { nodes: papers, edges: [{ source: 'p1', target: 'p2' }] };
        else if (name === 'citation-context')
            data = {
                supporting: [{ context: 'Independent evidence supports the finding.' }],
                contradicting: [],
                mentioning: [],
            };
        else if (name === 'pdf-upload')
            data = {
                chunks: ['Synthetic PDF text with an equation E = mc2.'],
                chunkCount: 2,
                formulas: [{ equation: '$E = mc^2$', context: 'Mass-energy equivalence' }],
            };
        else if (name === 'pdf-chat')
            data = { reply: 'The selected sources describe a relationship with cognitive health.' };
        else if (name === 'pdf-explain-math')
            data = {
                breakdown: 'E denotes energy, m mass, and c the speed of light.',
                analogy: 'A small amount of mass corresponds to a large amount of energy.',
            };
        else throw new Error(`Unmocked API: ${name}`);
        await route.fulfill({ json: data });
    });
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.title(), 'Evidara | Research Evidence Workspace');
    await page.screenshot({ path: `${output}/evidara-empty-desktop.png`, fullPage: true });
    const search = async (query) => {
        await page.locator('[data-view="discover"]').first().click();
        await page.locator('#search-input').fill(query);
        await page.locator('#search-submit').click();
        await page.waitForFunction(
            () => document.querySelector('#search-submit').textContent === 'Search papers',
        );
    };
    await search('Does exercise slow cognitive decline?');
    assert.equal(await page.locator('#results-list .paper-row').count(), 3);
    await page.screenshot({ path: `${output}/evidara-discover-desktop.png`, fullPage: true });
    await page.locator('#paper-sort').selectOption('recent');
    await page.locator('#results-list .save-paper').first().click();
    await page.locator('[data-view="library"]').first().click();
    assert.equal(await page.locator('#library-list .paper-row').count(), 1);
    await page.locator('#library-list .paper-title').click();
    await page.waitForFunction(() =>
        document
            .querySelector('#citation-context-content')
            .textContent.includes('Independent evidence'),
    );
    await page.locator('[data-view="evidence"]').first().click();
    assert.equal(await page.locator('#matrix-body tr').count(), 3);
    await page.screenshot({ path: `${output}/evidara-evidence-desktop.png`, fullPage: true });
    await page.locator('[data-view="map"]').first().click();
    await page.locator('#network-container canvas').waitFor();
    await page.locator('[data-graph-action="in"]').click();
    await page.locator('[data-graph-action="out"]').click();
    await page.locator('[data-graph-action="fit"]').click();
    await page.waitForTimeout(500);
    assert.match(await page.locator('#graph-edge-list').textContent(), /cites/);
    await page.screenshot({ path: `${output}/evidara-map-desktop.png`, fullPage: true });
    await page.locator('[data-view="reader"]').first().click();
    await page.locator('#pdf-file-input').setInputFiles({
        name: 'sample.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 synthetic fixture'),
    });
    await page.waitForFunction(() =>
        document.querySelector('#pdf-status').textContent.includes('document truncated'),
    );
    await page.locator('.formula-chip').click();
    await page.waitForFunction(() =>
        document.querySelector('#selected-formula-desc').textContent.includes('denotes energy'),
    );
    assert.equal(
        requests.findLast((r) => r.name === 'pdf-explain-math').body.context,
        'Mass-energy equivalence',
    );
    await page.locator('#equation-input').fill('a = b + c');
    await page.locator('#equation-form').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() =>
        document.querySelector('#selected-formula-desc').textContent.includes('denotes energy'),
    );
    await page.locator('#chat-input').fill('What do these sources show?');
    await page.locator('#chat-submit').click();
    await page.waitForFunction(() => !document.querySelector('#chat-submit').disabled);
    assert.equal(requests.findLast((r) => r.name === 'pdf-chat').body.chunks.length, 1);
    await page.screenshot({ path: `${output}/evidara-reader-desktop.png`, fullPage: true });
    await page.locator('#clear-pdf-btn').click();
    assert.equal(await page.locator('.formula-chip').count(), 0);
    assert.ok(
        !(await page.locator('#reader-source-content').textContent()).includes(
            'Synthetic PDF text',
        ),
    );
    await page.locator('#byok-btn').click();
    await page.locator('#gemini-key-input').fill('synthetic-test-key');
    await page.screenshot({ path: `${output}/evidara-settings-desktop.png`, fullPage: true });
    await page.locator('#settings-form').evaluate((form) => form.requestSubmit());
    assert.equal(await page.evaluate(() => localStorage.getItem('evidara_gemini_key')), null);
    await page.locator('#chat-input').fill('Check credential forwarding');
    await page.locator('#chat-submit').click();
    await page.waitForFunction(() => !document.querySelector('#chat-submit').disabled);
    assert.equal(
        requests.findLast((r) => r.name === 'pdf-chat').headers['x-gemini-key'],
        'synthetic-test-key',
    );
    await page.locator('#byok-btn').click();
    await page.locator('#remember-key').check();
    await page.locator('#settings-form').evaluate((form) => form.requestSubmit());
    assert.equal(
        await page.evaluate(() => localStorage.getItem('evidara_gemini_key')),
        'synthetic-test-key',
    );
    await page.locator('#byok-btn').click();
    await page.locator('#clear-keys-btn').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('evidara_gemini_key')), null);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#settings-dialog').evaluate((dialog) => dialog.open), false);
    await page.locator('[data-view="brief"]').first().click();
    await page.locator('#research-notes').fill('Important working note');
    await page.screenshot({ path: `${output}/evidara-brief-desktop.png`, fullPage: true });
    for (const [scope, formats] of [
        ['research', ['md', 'csv', 'json', 'bib']],
        ['library', ['md', 'csv', 'json', 'bib']],
        ['matrix', ['md', 'csv', 'json']],
        ['graph', ['json', 'bib']],
    ]) {
        await page.locator('#export-scope').selectOption(scope);
        for (const format of formats) {
            const pending = page.waitForEvent('download');
            await page.locator(`[data-export="${format}"]`).click();
            const download = await pending;
            const content = await readFile(await download.path(), 'utf8');
            assert.ok(content.length > 20, `${scope}/${format} content`);
            assert.ok(!content.includes('synthetic-test-key'), 'Keys excluded from exports');
            if (scope === 'research' && format === 'json')
                assert.equal(JSON.parse(content).notes, 'Important working note');
        }
    }
    await page.locator('#project-button').click();
    await page.locator('#project-title-input').fill('Second project');
    await page.locator('#project-form').evaluate((form) => form.requestSubmit());
    assert.equal(await page.locator('#project-name').textContent(), 'Second project');
    await page.locator('#project-button').click();
    await page.locator('.project-entry > button').filter({ hasText: 'Does exercise' }).click();
    await page.reload();
    await page.locator('[data-view="brief"]').first().click();
    assert.equal(await page.locator('#research-notes').inputValue(), 'Important working note');
    assert.equal(await page.locator('#formula-list .formula-chip').count(), 0, 'PDF not persisted');
    await search('empty case');
    assert.equal(await page.locator('#results-list .paper-row').count(), 0);
    await search('error case');
    assert.match(await page.locator('#search-status').textContent(), /temporarily unavailable/);
    await search('inert source');
    assert.equal(await page.locator('#results-list img, #results-list script').count(), 0);
    assert.equal(await page.evaluate(() => window.injection), undefined);
    await page.locator('#search-input').fill('slow case');
    await page.locator('#search-submit').click();
    await search('Does exercise slow cognitive decline?');
    assert.equal(
        await page.locator('#search-input').inputValue(),
        'Does exercise slow cognitive decline?',
    );
    for (const width of [1280, 1100, 768, 360]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            `No page overflow at ${width}`,
        );
        if (width === 360) {
            await page.locator('#menu-toggle').click();
            assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'true');
            await page.locator('[data-view="reader"]').first().click();
            assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
            await page.locator('#menu-toggle').click();
            await page.locator('[data-view="discover"]').first().click();
        }
        await page.screenshot({ path: `${output}/evidara-discover-${width}.png`, fullPage: true });
        for (const view of ['library', 'evidence', 'map', 'reader', 'brief', 'discover']) {
            if (width <= 760) await page.locator('#menu-toggle').click();
            await page.locator(`[data-view="${view}"]`).first().click();
            assert.ok(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth,
                ),
                `${view} fits at ${width}`,
            );
        }
    }
    await page.setViewportSize({ width: 1440, height: 1024 });
    const referencePapers = [
        {
            ...papers[0],
            title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
            authors: ['Lewis et al.'],
            year: 2020,
            venue: 'NeurIPS',
            citations: 4932,
            doi: '',
            abstract:
                'We propose a retrieval-augmented generation (RAG) model that combines a pre-trained seq2seq model with a non-parametric memory of Wikipedia documents, yielding substantial improvements in factual accuracy on knowledge-intensive tasks such as open-domain QA.',
        },
        {
            ...papers[1],
            title: 'REALM: Retrieval-Augmented Language Model Pre-Training',
            authors: ['Guu et al.'],
            year: 2020,
            venue: 'ICML',
            citations: 2117,
            doi: '',
            abstract:
                'We introduce REALM, a framework that augments language models with a learned knowledge retriever. The model accesses external knowledge during pre-training and improves performance on open-domain QA and factual verification compared to parametric baselines.',
        },
        {
            ...papers[2],
            title: 'Toolformer: Language Models Can Teach Themselves to Use Tools',
            authors: ['Schick et al.'],
            year: 2023,
            venue: 'NeurIPS',
            citations: 1406,
            doi: '',
            abstract:
                'We show that large language models can learn, through self-supervision, to call external tools such as search engines and calculators, improving factuality and reducing hallucinations across a range of tasks.',
        },
        ...Array.from({ length: 7 }, (_, i) => ({
            ...papers[2],
            id: `reference-${i}`,
            title: `Additional test source ${i + 1}`,
        })),
    ];
    await page.route('**/api/search', (route) =>
        route.fulfill({ json: { papers: referencePapers } }),
    );
    await page.route('**/api/consensus', (route) =>
        route.fulfill({
            json: {
                ...consensus,
                supportsCount: 6,
                neutralCount: 3,
                contradictsCount: 1,
                summaryText:
                    'Most evidence suggests that retrieval improves language-model accuracy, particularly for factual knowledge and domain-specific queries, by providing access to up-to-date and verifiable external information. Results are mixed for open-ended reasoning tasks, where gains depend on the retrieval method, data quality and integration strategy. A small number of studies reported limited or negative effects, including cases where irrelevant retrieval hurts performance.',
            },
        }),
    );
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#project-button').click();
    await page.locator('#project-title-input').fill('Retrieval & language models');
    await page.locator('#project-form').evaluate((form) => form.requestSubmit());
    await search('How does retrieval improve language-model accuracy?');
    await page.evaluate(() => document.activeElement.blur());
    await page.locator('#toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: `${output}/evidara-reference-state.png` });
    assert.deepEqual(errors, [], 'No browser runtime errors');
    console.log(
        'UI checks passed: search states, inert sources, library, comparison, citation graph/context, PDF, equations, chat, settings, 13 exports, projects/reload, desktop/tablet/mobile.',
    );
} finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
}
