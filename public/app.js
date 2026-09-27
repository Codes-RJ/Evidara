import { exportToMarkdown, exportToCsv, exportToJson, exportToBibTeX } from './js/export.js';

// Evidara's workspace uses the existing Netlify API routes. Source/model text is always inert.
const $ = (id) => document.getElementById(id);
const read = (key, fallback = '') => {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
};
const readJSON = (key, fallback) => {
    try {
        return JSON.parse(read(key)) ?? fallback;
    } catch {
        return fallback;
    }
};
const uid = () => crypto.randomUUID();
const node = (tag, text = '', className = '') => {
    const element = document.createElement(tag);
    element.textContent = String(text ?? '');
    if (className) element.className = className;
    return element;
};
const icon = (name) => {
    const element = node('i', '', `ph ph-${name}`);
    element.setAttribute('aria-hidden', 'true');
    return element;
};
let toastTimer;
function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        $('toast').hidden = true;
    }, 4200);
}
function status(id, message = '', kind = '') {
    const element = $(id);
    element.textContent = message;
    element.className = `status-line ${kind}`;
}
function empty(container, title, message, symbol = 'books') {
    const wrapper = node('div', '', 'empty-state');
    wrapper.append(icon(symbol), node('h3', title), node('p', message));
    container.replaceChildren(wrapper);
}
const blankProject = (title = 'Untitled research') => ({
    id: uid(),
    title,
    query: '',
    resultLimit: 25,
    papers: [],
    library: [],
    consensus: null,
    matrix: [],
    graph: { nodes: [], edges: [] },
    notes: '',
    createdAt: new Date().toISOString(),
});
let projects = readJSON('evidara_projects', []);
if (!Array.isArray(projects)) projects = [];
projects = projects.filter(
    (project) => project && typeof project.id === 'string' && typeof project.title === 'string',
);
const restored = projects.find((project) => project.id === read('evidara_active_project'));
const state = {
    ...blankProject(),
    ...restored,
    key: read('evidara_gemini_key', read('gemini_key')),
    groqKey: read('evidara_groq_key', read('groq_key')),
    keyMode: read('evidara_key_mode', read('gemini_key_mode', 'background')),
    selectedId: null,
    pdf: null,
    view: 'discover',
    run: 0,
    controller: null,
    network: null,
    readerMode: 'paper',
    contextRun: 0,
    documentRun: 0,
    chatRun: 0,
    mathRun: 0,
};
for (const field of ['papers', 'library', 'matrix'])
    if (!Array.isArray(state[field])) state[field] = [];
if (!state.graph || !Array.isArray(state.graph.nodes) || !Array.isArray(state.graph.edges))
    state.graph = { nodes: [], edges: [] };

function persist() {
    const snapshot = Object.fromEntries(
        [
            'id',
            'title',
            'query',
            'resultLimit',
            'papers',
            'library',
            'consensus',
            'matrix',
            'graph',
            'notes',
            'createdAt',
        ].map((field) => [field, state[field]]),
    );
    snapshot.updatedAt = new Date().toISOString();
    const next = [snapshot, ...projects.filter((project) => project.id !== state.id)].slice(0, 20);
    try {
        localStorage.setItem('evidara_projects', JSON.stringify(next));
        localStorage.setItem('evidara_active_project', state.id);
        projects = next;
        $('save-status').textContent = 'Saved in this browser';
        return true;
    } catch {
        $('save-status').textContent = 'Not saved · storage unavailable';
        return false;
    }
}
function headers(json = true) {
    const result = json ? { 'Content-Type': 'application/json' } : {};
    if (state.keyMode === 'byok' && state.key) result['X-Gemini-Key'] = state.key;
    if (state.groqKey) result['X-Groq-Key'] = state.groqKey;
    return result;
}
async function request(route, body, signal) {
    const timeout = AbortSignal.timeout(90000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const options = {
        method: 'POST',
        headers: headers(!(body instanceof FormData)),
        body: body instanceof FormData ? body : JSON.stringify(body),
        signal: requestSignal,
    };
    // Search is read-only: recover one cold-start/gateway failure within one submission.
    for (let attempt = 0; attempt < (route === 'search' ? 2 : 1); attempt++) {
        requestSignal.throwIfAborted();
        let response;
        try {
            response = await fetch(`/api/${route}`, options);
        } catch (error) {
            if (
                route === 'search' &&
                attempt === 0 &&
                !requestSignal.aborted &&
                error instanceof TypeError
            ) {
                await new Promise((done) => setTimeout(done, 500));
                continue;
            }
            throw error;
        }
        const retryAfterSeconds = Number(response.headers.get('Retry-After') || 0);
        if (
            route === 'search' &&
            attempt === 0 &&
            !requestSignal.aborted &&
            [408, 429, 500, 502, 503, 504].includes(response.status) &&
            Number.isFinite(retryAfterSeconds) &&
            retryAfterSeconds <= 1
        ) {
            await response.body?.cancel();
            await new Promise((done) => setTimeout(done, Math.max(500, retryAfterSeconds * 1000)));
            continue;
        }
        let data;
        try {
            data = await response.json();
        } catch {
            if (route === 'search' && attempt === 0 && !requestSignal.aborted) {
                await new Promise((done) => setTimeout(done, 500));
                continue;
            }
            throw new Error('The research service is unavailable. Please try again.');
        }
        if (!response.ok)
            throw new Error(
                String(data?.message || data?.error || `Request failed (${response.status})`),
            );
        if (route === 'search' && !Array.isArray(data?.papers)) {
            if (attempt === 0 && !requestSignal.aborted) {
                await new Promise((done) => setTimeout(done, 500));
                continue;
            }
            throw new Error('Search returned an invalid response. Please try again.');
        }
        return data;
    }
    throw new Error('The research service is unavailable. Please try again.');
}
function projectHeading() {
    $('project-name').textContent = state.title;
    $('breadcrumb-project').textContent = state.title;
}
function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    $('sidebar-scrim').hidden = !open;
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('sidebar').inert = matchMedia('(max-width: 760px)').matches && !open;
}
function showView(view, updateHash = true) {
    if (!['discover', 'library', 'evidence', 'reader', 'map', 'brief'].includes(view))
        view = 'discover';
    state.view = view;
    document.querySelectorAll('.view').forEach((element) => {
        element.hidden = element.id !== `view-${view}`;
    });
    document.querySelectorAll('[data-view]').forEach((element) => {
        const active = element.dataset.view === view;
        element.classList.toggle('active', active);
        if (active) element.setAttribute('aria-current', 'page');
        else element.removeAttribute('aria-current');
    });
    $('breadcrumb-view').textContent = {
        map: 'Citation map',
        discover: 'Discover',
        library: 'Library',
        evidence: 'Evidence',
        reader: 'Reader',
        brief: 'Brief',
    }[view];
    if (updateHash && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
    setNav(false);
    if (view === 'library') renderLibrary();
    if (view === 'brief') renderBrief();
    if (view === 'map') requestAnimationFrame(renderGraph);
    window.scrollTo({ top: 0 });
}
function paperUrl(paper) {
    if (typeof paper.doi === 'string' && paper.doi.trim())
        return `https://doi.org/${encodeURI(paper.doi.replace(/^https?:\/\/doi\.org\//i, ''))}`;
    if (typeof paper.id === 'string' && /^https:\/\/openalex\.org\/W\d+$/i.test(paper.id))
        return paper.id;
    if (typeof paper.id === 'string' && /^[a-z0-9-]+$/i.test(paper.id))
        return `https://www.semanticscholar.org/paper/${encodeURIComponent(paper.id)}`;
    return `https://www.semanticscholar.org/search?q=${encodeURIComponent(paper.title || '')}`;
}
function renderPapers(container, papers, library = false) {
    if (!papers.length) {
        empty(
            container,
            library ? 'Your reading list, ready to grow.' : 'No matching papers found.',
            library
                ? 'Save a paper in Discover to keep it in this project.'
                : 'Try a broader research question or a different phrase.',
        );
        return;
    }
    container.replaceChildren();
    const sorted = [...papers];
    if (!library && $('paper-sort').value === 'citations')
        sorted.sort((a, b) => (b.citations || 0) - (a.citations || 0));
    if (!library && $('paper-sort').value === 'recent')
        sorted.sort((a, b) => (b.year || 0) - (a.year || 0));
    sorted.forEach((paper, index) => {
        const row = node(
            'article',
            '',
            `paper-row${paper.id === state.selectedId ? ' selected' : ''}`,
        );
        const content = node('div');
        const titleRow = node('div', '', 'paper-title-row');
        const title = node('button', paper.title || 'Untitled paper', 'paper-title');
        title.addEventListener('click', () => selectPaper(paper));
        const source = node('a', 'View source', 'source-link');
        source.href = paperUrl(paper);
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        source.append(icon('arrow-square-out'));
        titleRow.append(title, source);
        const authors = Array.isArray(paper.authors) ? paper.authors.join(', ') : 'Unknown author';
        const metadata = [authors || 'Unknown author', paper.year || 'Year unknown', paper.venue]
            .filter(Boolean)
            .join(' · ');
        content.append(
            titleRow,
            node('p', metadata, 'paper-meta'),
            node('p', paper.abstract || 'No abstract available.', 'paper-abstract'),
        );
        if (paper.id === state.selectedId && paper.abstract)
            content.append(
                node(
                    'div',
                    `Abstract excerpt: ${paper.abstract.slice(0, 180)}${paper.abstract.length > 180 ? '…' : ''}`,
                    'source-excerpt',
                ),
            );
        const tags = node('div', '', 'paper-tags');
        tags.append(
            node('span', `Cited by ${Number(paper.citations || 0).toLocaleString()}`, 'paper-tag'),
        );
        if (paper.doi) tags.append(node('span', paper.doi, 'paper-tag'));
        if (paper.consensusStance)
            tags.append(
                node(
                    'span',
                    { supports: 'Supports', contradicts: 'Conflicts', neutral: 'Mixed / unclear' }[
                        paper.consensusStance
                    ] || 'Unclassified',
                    'paper-tag',
                ),
            );
        const saved = state.library.some((item) => item.id === paper.id);
        const save = node('button', '', 'save-paper');
        save.setAttribute('aria-pressed', String(saved));
        save.setAttribute(
            'aria-label',
            `${saved ? 'Remove from' : 'Save to'} library: ${paper.title}`,
        );
        save.append(
            icon(saved ? 'bookmark-simple' : 'bookmark'),
            node('span', saved ? 'Saved' : 'Save'),
        );
        save.addEventListener('click', () => {
            state.library = saved
                ? state.library.filter((item) => item.id !== paper.id)
                : [...state.library, paper];
            persist();
            renderResults();
            renderLibrary();
            toast(saved ? 'Paper removed from this library.' : 'Paper saved to this library.');
        });
        tags.append(save);
        content.append(tags);
        row.append(node('span', index + 1, 'paper-index'), content);
        container.append(row);
    });
}
function renderResults() {
    renderPapers($('results-list'), state.papers);
}
function renderLibrary() {
    renderPapers($('library-list'), state.library, true);
    $('library-count').textContent = state.library.length;
    $('library-count').hidden = !state.library.length;
}
function renderConsensus() {
    const data = state.consensus;
    $('consensus-progress-box').hidden = !data;
    $('papers-sampled-badge').textContent = state.papers.length
        ? `Across ${state.papers.length} analyzed papers`
        : 'Your research starts here';
    if (!data) {
        $('consensus-summary-text').textContent = state.papers.length
            ? 'The synthesis is not available yet. You can still inspect and save your sources.'
            : 'Start with a question. Evidara will find relevant papers and help you see where their findings align—and where they differ.';
        return;
    }
    $('consensus-summary-text').textContent = data.summaryText || 'No synthesis was returned.';
    const counts = [data.supportsCount, data.neutralCount, data.contradictsCount].map((value) =>
        Math.max(0, Number(value) || 0),
    );
    const total = counts.reduce((a, b) => a + b, 0);
    ['supports', 'neutral', 'contradicts'].forEach((type, index) => {
        $(`stat-${type}`).textContent = counts[index];
        $(`consensus-bar-${type}`).style.width = `${total ? (counts[index] / total) * 100 : 0}%`;
    });
    $('analysis-basis').textContent = String(data.summaryText).includes('[Local Fallback Mode]')
        ? 'Keyword-based fallback · configure Gemini for AI analysis. These counts do not establish scientific certainty.'
        : 'Abstract-based stance across this sample. Counts are not a measure of scientific certainty.';
}
function renderMatrix(message) {
    const body = $('matrix-body');
    body.replaceChildren();
    if (!state.matrix.length) {
        const row = node('tr');
        const cell = node(
            'td',
            message || 'Search for papers to build a comparison matrix.',
            'table-empty',
        );
        cell.colSpan = 5;
        row.append(cell);
        body.append(row);
        return;
    }
    state.matrix.forEach((item) => {
        const row = node('tr');
        for (const field of ['title', 'datasetSize', 'methodology', 'outcomes', 'limitations'])
            row.append(node('td', item[field] || 'Not reported'));
        body.append(row);
    });
}
function graphLabel(title) {
    const text = String(title || 'Paper');
    if (text.length <= 26) return text;
    const boundary = text.lastIndexOf(' ', 26);
    const split = boundary >= 12 ? boundary : 26;
    const remainder = text.slice(split).trim();
    return `${text.slice(0, split)}\n${remainder.slice(0, 26).trim()}${remainder.length > 26 ? '…' : ''}`;
}
function fitGraph() {
    if (!state.network) return;
    state.network.fit({ animation: false });
    state.network.moveTo({ scale: state.network.getScale() * 0.85, animation: false });
}
function renderGraph() {
    if (state.view !== 'map') return;
    if (state.network) {
        state.network.destroy();
        state.network = null;
    }
    const container = $('network-container');
    if (!state.graph.nodes.length) {
        empty(
            container,
            'No citation map yet.',
            state.papers.length
                ? 'Citation relationships may be unavailable for these sources.'
                : 'Search for papers to explore their connections.',
            'graph',
        );
        return;
    }
    if (!window.vis?.Network) {
        empty(
            container,
            'The graph could not load.',
            'Citation relationships are still available in the list below.',
            'graph',
        );
        return;
    }
    container.replaceChildren();
    const nodes = state.graph.nodes.map((paper) => ({
        id: paper.id,
        label: graphLabel(paper.title),
        title: node('div', paper.title),
        value: Math.max(1, Math.log2((paper.citations || 0) + 2)),
        color: {
            background: '#e3edff',
            border: '#82a9e3',
            highlight: { background: '#bcd6ff', border: '#075cf4' },
        },
    }));
    state.network = new window.vis.Network(
        container,
        {
            nodes,
            edges: state.graph.edges.map((edge) => ({
                from: edge.source,
                to: edge.target,
                arrows: 'to',
            })),
        },
        {
            nodes: { shape: 'dot', font: { face: 'Inter', size: 12, color: '#304b73' } },
            edges: { color: '#bccde5', smooth: { type: 'continuous' }, width: 1 },
            layout: { randomSeed: 7 },
            physics: {
                solver: 'repulsion',
                repulsion: {
                    nodeDistance: 240,
                    springLength: 260,
                    springConstant: 0.03,
                    centralGravity: 0.05,
                },
                stabilization: { iterations: 180 },
            },
            interaction: { hover: true, navigationButtons: false, keyboard: true },
        },
    );
    state.network.once('stabilized', fitGraph);
    state.network.on('selectNode', ({ nodes: selected }) => {
        const paper = state.papers.find((item) => item.id === selected[0]);
        if (paper) {
            selectPaper(paper);
            toast('Paper selected. Open Reader to inspect it.');
        }
    });
}
function renderEdges() {
    const list = $('graph-edge-list');
    list.replaceChildren();
    const names = new Map(state.graph.nodes.map((paper) => [paper.id, paper.title]));
    if (!state.graph.edges.length)
        list.append(node('li', 'No citation relationships are available.'));
    state.graph.edges.forEach((edge) =>
        list.append(
            node(
                'li',
                `${names.get(edge.source) || edge.source} cites ${names.get(edge.target) || edge.target}`,
            ),
        ),
    );
}
async function selectPaper(paper) {
    state.selectedId = paper.id;
    state.readerMode = 'paper';
    renderResults();
    renderLibrary();
    renderReader();
    const contextRun = ++state.contextRun;
    $('citation-context-content').replaceChildren(node('p', 'Loading citation context…', 'muted'));
    try {
        const data = await request('citation-context', { doi: paper.doi, title: paper.title });
        if (contextRun !== state.contextRun) return;
        const container = $('citation-context-content');
        container.replaceChildren();
        for (const [field, title] of [
            ['supporting', 'Supporting'],
            ['contradicting', 'Conflicting'],
            ['mentioning', 'Mentioning'],
        ]) {
            const values = Array.isArray(data[field]) ? data[field] : [];
            const group = node('div', '', 'citation-group');
            group.append(node('h4', `${title} (${values.length})`));
            if (!values.length) group.append(node('p', 'No annotated context available.'));
            values.slice(0, 5).forEach((item) => group.append(node('p', item.context)));
            container.append(group);
        }
    } catch (error) {
        if (contextRun === state.contextRun)
            $('citation-context-content').replaceChildren(
                node('p', `Citation context unavailable: ${error.message}`, 'muted'),
            );
    }
}
function renderReader() {
    const container = $('reader-source-content');
    container.replaceChildren();
    if (state.readerMode === 'pdf' && state.pdf) {
        $('reader-source-title').textContent = state.pdf.name;
        $('reader-source-badge').textContent = 'Extracted PDF text';
        container.append(
            node(
                'p',
                'Text extraction may omit formatting, images, or mathematical notation.',
                'muted',
            ),
        );
        state.pdf.chunks.forEach((chunk) => container.append(node('p', chunk)));
        return;
    }
    const paper =
        state.papers.find((item) => item.id === state.selectedId) ||
        state.library.find((item) => item.id === state.selectedId);
    $('reader-source-title').textContent = 'Source details';
    $('reader-source-badge').textContent = paper ? 'Abstract' : 'No source selected';
    if (!paper) {
        container.append(
            node(
                'p',
                'Select a paper in Discover, or upload an academic PDF. Its text will appear here beside your research assistant.',
            ),
        );
        return;
    }
    container.append(
        node('h3', paper.title),
        node('p', `${(paper.authors || []).join(', ')} · ${paper.year || 'Year unknown'}`, 'muted'),
        node('p', paper.abstract || 'No abstract available.'),
    );
    const source = node('a', 'Read the original source');
    source.href = paperUrl(paper);
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    container.append(source);
    if (state.pdf) {
        const back = node('button', 'Return to uploaded PDF', 'button button-secondary');
        back.addEventListener('click', () => {
            state.readerMode = 'pdf';
            renderReader();
        });
        container.append(back);
    }
}
function renderBrief() {
    const container = $('brief-summary');
    container.replaceChildren();
    if (!state.papers.length) {
        container.append(
            node('p', 'Your synthesis and sources will appear after a search.', 'muted'),
        );
        return;
    }
    container.append(
        node('h3', state.query),
        node(
            'p',
            state.consensus?.summaryText ||
                'Synthesis unavailable. Review the source papers directly.',
        ),
    );
    const list = node('ul');
    state.papers.forEach((paper) => {
        const entry = node('li');
        const link = node('a', `${paper.title} (${paper.year || 'undated'})`);
        link.href = paperUrl(paper);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        entry.append(link);
        list.append(entry);
    });
    container.append(list);
    $('research-notes').value = state.notes || '';
}
async function search(query) {
    query = String(query).trim();
    if (!query) return;
    state.controller?.abort();
    state.controller = new AbortController();
    const signal = state.controller.signal;
    const run = ++state.run;
    state.query = query;
    state.resultLimit = Number($('search-limit').value);
    if (state.title === 'Untitled research') state.title = query.slice(0, 70);
    state.papers = [];
    state.consensus = null;
    state.matrix = [];
    state.graph = { nodes: [], edges: [] };
    state.selectedId = null;
    ++state.contextRun;
    projectHeading();
    showView('discover');
    $('search-input').value = query;
    $('search-submit').textContent = 'Searching…';
    status('search-status', 'Finding relevant publications…', 'pending');
    status('matrix-status', 'Waiting for papers…', 'pending');
    status('graph-status', 'Waiting for papers…', 'pending');
    renderConsensus();
    renderMatrix('Waiting for search results…');
    renderEdges();
    empty(
        $('results-list'),
        'Searching the literature…',
        'Finding papers relevant to your question.',
        'magnifying-glass',
    );
    try {
        const data = await request('search', { query, limit: state.resultLimit }, signal);
        if (run !== state.run) return;
        state.papers = Array.isArray(data.papers)
            ? data.papers.filter(
                  (paper) =>
                      paper && typeof paper.id === 'string' && typeof paper.title === 'string',
              )
            : [];
        state.selectedId = state.papers[0]?.id || null;
        renderResults();
        renderReader();
        renderConsensus();
        persist();
        if (!state.papers.length) {
            if (data.emptyReason === 'NO_USABLE_ABSTRACTS') {
                status(
                    'search-status',
                    'Matching records were found, but none supplied a usable abstract for analysis.',
                );
                empty(
                    $('results-list'),
                    'No abstracts available for this search.',
                    'Try a broader phrase or another topic. These providers did not supply abstracts for the matching records.',
                );
            } else status('search-status', 'No matching papers found. Try a broader question.');
            status('matrix-status');
            status('graph-status');
            renderMatrix('No papers to compare. Try another search.');
            return;
        }
        status(
            'search-status',
            `${state.papers.length} papers found · preparing synthesis, comparison, and citations…`,
            'pending',
        );
        const papers = [...state.papers];
        const tasks = [
            request('consensus', { query, papers }, signal)
                .then((result) => {
                    if (run !== state.run) return;
                    state.consensus = result;
                    state.papers.forEach((paper) => {
                        paper.consensusStance = result.paperStances?.[paper.id];
                    });
                    renderConsensus();
                    renderResults();
                    persist();
                })
                .catch((error) => {
                    if (run === state.run && !signal.aborted)
                        $('consensus-summary-text').textContent =
                            `Synthesis unavailable: ${error.message}. You can still inspect the source papers.`;
                }),
            request('compare', { papers }, signal)
                .then((result) => {
                    if (run !== state.run) return;
                    state.matrix = Array.isArray(result.matrix) ? result.matrix : [];
                    renderMatrix();
                    status(
                        'matrix-status',
                        state.matrix.some((row) =>
                            String(row.limitations).includes('Requires Gemini'),
                        )
                            ? 'Metadata fallback · configure Gemini for study extraction.'
                            : `${state.matrix.length} studies · verify extracted details against their sources.`,
                    );
                    persist();
                })
                .catch((error) => {
                    if (run === state.run && !signal.aborted) {
                        renderMatrix('Comparison unavailable. Your paper list is still available.');
                        status('matrix-status', error.message, 'error');
                    }
                }),
            request('network-graph', { query, papers }, signal)
                .then((result) => {
                    if (run !== state.run) return;
                    state.graph = {
                        nodes: Array.isArray(result.nodes) ? result.nodes : [],
                        edges: Array.isArray(result.edges) ? result.edges : [],
                    };
                    renderEdges();
                    renderGraph();
                    status(
                        'graph-status',
                        `${state.graph.nodes.length} papers · ${state.graph.edges.length} citation relationships`,
                    );
                    persist();
                })
                .catch((error) => {
                    if (run === state.run && !signal.aborted)
                        status('graph-status', error.message, 'error');
                }),
        ];
        await Promise.allSettled(tasks);
        if (run !== state.run) return;
        status(
            'search-status',
            `${state.papers.length} papers found. Review the sources before drawing conclusions.`,
        );
        renderBrief();
    } catch (error) {
        if (run === state.run && !signal.aborted) {
            status(
                'search-status',
                error.name === 'TimeoutError'
                    ? 'Search timed out. Please try again.'
                    : error.message,
                'error',
            );
            empty(
                $('results-list'),
                'The search could not finish.',
                'Try again in a moment or check your provider settings.',
                'warning-circle',
            );
            status('matrix-status');
            status('graph-status');
            renderMatrix();
        }
    } finally {
        if (run === state.run) $('search-submit').textContent = 'Search papers';
    }
}
function appendChat(sender, text) {
    const message = node('div', text, `message ${sender}-message`);
    $('chat-messages').append(message);
    $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
    return message;
}
async function chat(event) {
    event.preventDefault();
    const message = $('chat-input').value.trim();
    if (!message || $('chat-submit').disabled) return;
    const projectId = state.id;
    const chatRun = ++state.chatRun;
    appendChat('user', message);
    $('chat-input').value = '';
    $('chat-submit').disabled = true;
    const pending = appendChat('system', 'Reading your research…');
    try {
        const data = await request('pdf-chat', {
            message,
            chunks: state.pdf?.chunks || [],
            searchResults: state.papers,
        });
        if (projectId === state.id && chatRun === state.chatRun)
            appendChat(
                'ai',
                data.reply || 'No answer was returned. Please try a more specific question.',
            );
    } catch (error) {
        if (projectId === state.id && chatRun === state.chatRun)
            appendChat('ai', `The assistant could not answer: ${error.message}`);
    } finally {
        pending.remove();
        if (chatRun === state.chatRun) $('chat-submit').disabled = false;
    }
}
async function upload(file) {
    if (!file) return;
    if (!(file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name)))) {
        toast('Please choose a PDF document.');
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        toast('Please choose a PDF smaller than 10 MB.');
        return;
    }
    showView('reader');
    const documentRun = ++state.documentRun;
    status('pdf-status', `Reading ${file.name}…`, 'pending');
    const body = new FormData();
    body.append('pdf', file);
    try {
        const data = await request('pdf-upload', body);
        if (documentRun !== state.documentRun) return;
        state.pdf = {
            name: file.name,
            chunks: Array.isArray(data.chunks) ? data.chunks : [],
            formulas: Array.isArray(data.formulas) ? data.formulas : [],
        };
        state.readerMode = 'pdf';
        $('clear-pdf-btn').hidden = false;
        ++state.contextRun;
        renderReader();
        $('citation-context-content').replaceChildren(
            node('p', 'Citation context applies to selected online papers.', 'muted'),
        );
        renderFormulas();
        status(
            'pdf-status',
            `${file.name} · ${state.pdf.chunks.length} text chunks available${data.chunkCount > state.pdf.chunks.length ? ` of ${data.chunkCount} extracted (document truncated)` : ''}. PDF text stays in this tab.`,
        );
        appendChat('system', `Uploaded ${file.name}. You can now ask about this document.`);
    } catch (error) {
        if (documentRun === state.documentRun)
            status('pdf-status', `Could not read this PDF: ${error.message}`, 'error');
    } finally {
        $('pdf-file-input').value = '';
    }
}
function renderFormulas() {
    const container = $('formula-list');
    container.replaceChildren();
    if (!state.pdf?.formulas.length) {
        container.append(
            node(
                'p',
                'No dollar-delimited formulas detected. You can paste an equation below.',
                'muted',
            ),
        );
        return;
    }
    state.pdf.formulas.forEach((formula) => {
        const button = node('button', formula.equation, 'formula-chip');
        button.addEventListener('click', () => explain(formula.equation, formula.context));
        container.append(button);
    });
}
async function explain(equation, context = '') {
    if (!equation.trim()) return;
    const mathRun = ++state.mathRun;
    $('formula-explanation').hidden = false;
    $('selected-formula-text').textContent = equation;
    $('selected-formula-desc').textContent = 'Explaining this equation…';
    try {
        const data = await request('pdf-explain-math', { equation, context });
        if (mathRun !== state.mathRun) return;
        $('selected-formula-desc').textContent = String(data.breakdown).includes(
            'Requires Gemini API Key',
        )
            ? 'Configure a Gemini key in Settings for an explanation of this equation.'
            : `Variables & purpose\n${data.breakdown || 'No breakdown returned.'}\n\nPhysical analogy\n${data.analogy || 'No analogy returned.'}`;
    } catch (error) {
        if (mathRun === state.mathRun)
            $('selected-formula-desc').textContent = `Explanation unavailable: ${error.message}`;
    }
}
function openSettings(byok = false) {
    $('gemini-key-input').value = state.key;
    $('groq-key-input').value = state.groqKey;
    $('remember-key').checked = Boolean(read('evidara_gemini_key', read('gemini_key')));
    const mode = byok ? 'byok' : state.keyMode;
    document.querySelector(
        `[name="key-mode"][value="${mode === 'byok' ? 'byok' : 'background'}"]`,
    ).checked = true;
    $('byok-fields').hidden = mode !== 'byok';
    $('settings-dialog').showModal();
}
function saveSettings(event) {
    event.preventDefault();
    state.keyMode = document.querySelector('[name="key-mode"]:checked').value;
    state.key = $('gemini-key-input').value.trim();
    state.groqKey = $('groq-key-input').value.trim();
    try {
        localStorage.setItem('evidara_key_mode', state.keyMode);
        for (const key of ['gemini_key', 'groq_key', 'evidara_gemini_key', 'evidara_groq_key'])
            localStorage.removeItem(key);
        if ($('remember-key').checked) {
            if (state.key) localStorage.setItem('evidara_gemini_key', state.key);
            if (state.groqKey) localStorage.setItem('evidara_groq_key', state.groqKey);
        }
    } catch {
        toast('Settings apply to this tab; browser storage is unavailable.');
    }
    $('settings-dialog').close();
    toast('Provider settings saved.');
}
function renderProjects() {
    const container = $('project-list');
    container.replaceChildren();
    if (!projects.length) {
        container.append(
            node('p', 'Your first project will be saved when you start researching.', 'muted'),
        );
        return;
    }
    projects.forEach((project) => {
        const entry = node('div', '', 'project-entry');
        const open = node('button', project.title);
        open.append(
            node(
                'small',
                `${project.papers?.length || 0} papers · ${new Date(project.updatedAt || project.createdAt).toLocaleDateString()}`,
            ),
        );
        open.addEventListener('click', () => {
            loadProject(project);
            $('projects-dialog').close();
        });
        const remove = node('button', '', 'icon-button');
        remove.append(icon('trash'));
        remove.setAttribute('aria-label', `Delete project: ${project.title}`);
        remove.addEventListener('click', () => {
            if (!confirm(`Delete "${project.title}" from this browser?`)) return;
            const next = projects.filter((item) => item.id !== project.id);
            try {
                localStorage.setItem('evidara_projects', JSON.stringify(next));
                projects = next;
                if (state.id === project.id) {
                    localStorage.removeItem('evidara_active_project');
                    loadProject(blankProject(), false);
                    $('save-status').textContent = 'New project';
                }
                renderProjects();
                toast('Project deleted from this browser.');
            } catch {
                toast('Could not delete the saved project.');
            }
        });
        entry.append(open, remove);
        container.append(entry);
    });
}
function loadProject(project, save = true) {
    state.controller?.abort();
    ++state.run;
    ++state.contextRun;
    ++state.documentRun;
    ++state.chatRun;
    ++state.mathRun;
    Object.assign(state, blankProject(), project);
    state.selectedId = state.papers[0]?.id || null;
    state.pdf = null;
    $('clear-pdf-btn').hidden = true;
    state.readerMode = 'paper';
    if (state.network) {
        state.network.destroy();
        state.network = null;
    }
    $('search-input').value = state.query;
    $('search-limit').value = String(
        [10, 25, 50].includes(state.resultLimit) ? state.resultLimit : 25,
    );
    $('search-submit').textContent = 'Search papers';
    $('research-notes').value = state.notes || '';
    $('chat-submit').disabled = false;
    $('chat-messages').replaceChildren(
        node(
            'div',
            'Ask about this project’s papers, or upload a PDF for document questions.',
            'message ai-message',
        ),
    );
    $('formula-explanation').hidden = true;
    status('pdf-status');
    status('search-status');
    status('matrix-status');
    status('graph-status');
    $('citation-context-content').replaceChildren(
        node('p', 'Select a paper to inspect its citation context.', 'muted'),
    );
    projectHeading();
    renderResults();
    renderLibrary();
    renderConsensus();
    renderMatrix();
    renderReader();
    renderFormulas();
    renderEdges();
    renderBrief();
    showView('discover');
    if (save) persist();
}
function csvCell(value) {
    const text = String(value ?? '');
    return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
}
function matrixCsv() {
    const fields = ['title', 'datasetSize', 'methodology', 'outcomes', 'limitations'];
    return [
        fields.join(','),
        ...state.matrix.map((row) => fields.map((field) => csvCell(row[field])).join(',')),
    ].join('\n');
}
function matrixMarkdown() {
    const fields = ['title', 'datasetSize', 'methodology', 'outcomes', 'limitations'];
    const clean = (value) =>
        String(value ?? 'Not reported')
            .replace(/\|/g, '\\|')
            .replace(/\r?\n/g, ' ');
    return `# Evidara Study Comparison\n\n| Publication | Dataset size | Methodology | Outcomes | Limitations |\n|---|---|---|---|---|\n${state.matrix.map((row) => `| ${fields.map((field) => clean(row[field])).join(' | ')} |`).join('\n')}`;
}
function exportResearch(format) {
    const scope = $('export-scope').value;
    const papers = scope === 'library' ? state.library : state.papers;
    if (
        (scope === 'matrix' && !state.matrix.length) ||
        (scope === 'graph' && !state.graph.nodes.length) ||
        (['research', 'library'].includes(scope) && !papers.length)
    ) {
        toast('There is no content to export yet.');
        return;
    }
    let content;
    let type = 'text/plain';
    if (scope === 'matrix')
        content =
            format === 'csv'
                ? matrixCsv()
                : format === 'md'
                  ? matrixMarkdown()
                  : JSON.stringify({ query: state.query, matrix: state.matrix }, null, 2);
    else if (scope === 'graph' && format === 'json')
        content = JSON.stringify(
            {
                query: state.query,
                nodes: state.graph.nodes,
                links: state.graph.edges,
                edges: state.graph.edges,
            },
            null,
            2,
        );
    else if (format === 'md')
        content = `${exportToMarkdown(state.query, state.consensus, papers)}${state.notes ? `\n## Research Notes\n${state.notes}\n` : ''}`;
    else if (format === 'csv') content = exportToCsv(papers);
    else if (format === 'bib') content = exportToBibTeX(papers);
    else {
        const data = JSON.parse(exportToJson(state.query, state.consensus, papers));
        data.schemaVersion = '1.0';
        data.project = { id: state.id, title: state.title };
        data.notes = state.notes;
        data.matrix = state.matrix;
        data.graph = state.graph;
        content = JSON.stringify(data, null, 2);
    }
    type = {
        json: 'application/json',
        csv: 'text/csv',
        md: 'text/markdown',
        bib: 'application/x-bibtex',
    }[format];
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Evidara_${scope}_${state.query.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 70) || 'research'}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Export downloaded.');
}
function exportScope(scope) {
    showView('brief');
    $('export-scope').value = scope;
    updateExportOptions();
    $('export-scope').focus();
}
function updateExportOptions() {
    document.querySelectorAll('[data-export]').forEach((button) => {
        const scope = $('export-scope').value;
        button.disabled =
            (scope === 'graph' && !['json', 'bib'].includes(button.dataset.export)) ||
            (scope === 'matrix' && button.dataset.export === 'bib');
    });
}

$('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    search($('search-input').value);
});
document
    .querySelectorAll('[data-query]')
    .forEach((button) => button.addEventListener('click', () => search(button.dataset.query)));
document.querySelectorAll('[data-view]').forEach((link) =>
    link.addEventListener('click', (event) => {
        event.preventDefault();
        showView(link.dataset.view);
    }),
);
window.addEventListener('hashchange', () => showView(location.hash.slice(1), false));
window.addEventListener('popstate', () => showView(location.hash.slice(1), false));
$('paper-sort').addEventListener('change', renderResults);
document.querySelectorAll('[data-graph-action]').forEach((button) =>
    button.addEventListener('click', () => {
        if (!state.network) {
            toast('Search for papers to create a citation map first.');
            return;
        }
        if (button.dataset.graphAction === 'fit') fitGraph();
        else
            state.network.moveTo({
                scale:
                    state.network.getScale() * (button.dataset.graphAction === 'in' ? 1.25 : 0.8),
                animation: false,
            });
    }),
);
$('menu-toggle').addEventListener('click', () =>
    setNav(!document.body.classList.contains('nav-open')),
);
$('sidebar-scrim').addEventListener('click', () => setNav(false));
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setNav(false);
});
matchMedia('(max-width: 760px)').addEventListener('change', () => setNav(false));
for (const id of ['settings-btn', 'profile-settings-btn', 'footer-settings-btn'])
    $(id).addEventListener('click', () => openSettings());
$('byok-btn').addEventListener('click', () => openSettings(true));
document
    .querySelectorAll('[data-close]')
    .forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('[name="key-mode"]').forEach((radio) =>
    radio.addEventListener('change', () => {
        $('byok-fields').hidden = radio.value !== 'byok' || !radio.checked;
    }),
);
$('settings-form').addEventListener('submit', saveSettings);
$('clear-keys-btn').addEventListener('click', () => {
    state.key = '';
    state.groqKey = '';
    for (const key of ['gemini_key', 'groq_key', 'evidara_gemini_key', 'evidara_groq_key']) {
        try {
            localStorage.removeItem(key);
        } catch {
            /* In-memory keys still cleared. */
        }
    }
    $('gemini-key-input').value = '';
    $('groq-key-input').value = '';
    $('remember-key').checked = false;
    toast('Saved and active keys cleared.');
});
for (const id of ['upload-pdf-btn', 'reader-upload-btn'])
    $(id).addEventListener('click', () => $('pdf-file-input').click());
$('pdf-file-input').addEventListener('change', (event) => upload(event.target.files[0]));
$('clear-pdf-btn').addEventListener('click', () => {
    ++state.documentRun;
    ++state.mathRun;
    ++state.chatRun;
    state.pdf = null;
    state.readerMode = 'paper';
    $('clear-pdf-btn').hidden = true;
    $('formula-explanation').hidden = true;
    $('chat-submit').disabled = false;
    $('chat-messages').replaceChildren(
        node(
            'div',
            'PDF removed. You can still ask about this project’s search results.',
            'message ai-message',
        ),
    );
    renderReader();
    renderFormulas();
    status('pdf-status', 'PDF text removed from this tab.');
});
$('chat-nav-btn').addEventListener('click', () => {
    showView('reader');
    $('chat-input').focus();
});
$('equations-nav-btn').addEventListener('click', () => {
    showView('reader');
    $('equations-section').scrollIntoView({ behavior: 'smooth' });
    $('equation-input').focus({ preventScroll: true });
});
$('chat-form').addEventListener('submit', chat);
$('chat-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        $('chat-form').requestSubmit();
    }
});
$('equation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    explain($('equation-input').value.trim());
});
$('project-button').addEventListener('click', () => {
    renderProjects();
    $('projects-dialog').showModal();
});
$('project-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('project-title-input').value.trim();
    if (!title) return;
    persist();
    loadProject(blankProject(title));
    $('project-title-input').value = '';
    $('projects-dialog').close();
    toast('Project created in this browser.');
});
$('save-project-btn').addEventListener('click', () =>
    toast(
        persist()
            ? 'Project saved in this browser.'
            : 'Project could not be saved. Browser storage is unavailable.',
    ),
);
$('research-notes').addEventListener('input', () => {
    state.notes = $('research-notes').value;
    persist();
});
for (const id of ['sidebar-export-btn', 'export-brief-btn'])
    $(id).addEventListener('click', () => exportScope('research'));
$('library-export-btn').addEventListener('click', () => exportScope('library'));
$('matrix-export-btn').addEventListener('click', () => exportScope('matrix'));
$('graph-export-btn').addEventListener('click', () => exportScope('graph'));
document
    .querySelectorAll('[data-export]')
    .forEach((button) =>
        button.addEventListener('click', () => exportResearch(button.dataset.export)),
    );
$('export-scope').addEventListener('change', updateExportOptions);
projectHeading();
renderLibrary();
renderConsensus();
renderMatrix();
renderReader();
renderEdges();
renderBrief();
if (state.papers.length) {
    state.selectedId = state.papers[0].id;
    renderResults();
    renderReader();
}
$('search-input').value = state.query;
$('search-limit').value = String([10, 25, 50].includes(state.resultLimit) ? state.resultLimit : 25);
$('research-notes').value = state.notes || '';
showView(location.hash.slice(1) || 'discover', false);
