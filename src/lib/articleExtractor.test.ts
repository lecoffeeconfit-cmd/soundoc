import { extractArticleFromHtml } from './importers';

type Fixture = { name: string; html: string; url: string; includes?: string[]; excludes?: string[]; suspicious?: boolean };

export const articleExtractorFixtures: Fixture[] = [
  { name: 'NCBI PMC scientific article', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/', html: '<header>NLM disclaimer Navigation Search</header><nav>Home Articles Collections</nav><article><h1>Effects of Sleep on Memory</h1><div class="toc">Abstract Methods Results</div><p class="authors">A. Researcher</p><section id="abstract"><h2>Abstract</h2><p>We studied sleep and memory in a controlled cohort.</p></section><h2>Methods</h2><p>Participants completed a memory task after sleep.</p><h2>Results</h2><p>The sleep group performed better than controls.</p><aside>View on publisher site PDF Cite Collections Permalink</aside></article><footer>Copyright navigation Similar articles</footer>', includes: ['Effects of Sleep on Memory', 'Participants completed'], excludes: ['NLM disclaimer', 'View on publisher site', 'Collections', 'Copyright navigation'] },
  { name: 'News article', url: 'https://news.example.com/story', html: '<nav>Home Politics Subscribe</nav><main><h1>City opens a new public library</h1><p>Officials opened the library on Tuesday after years of planning.</p><p>The building includes reading rooms and community space.</p></main><aside>Related stories Advertisement</aside>', includes: ['City opens', 'reading rooms'], excludes: ['Subscribe', 'Advertisement'] },
  { name: 'Blog post', url: 'https://blog.example.com/post', html: '<div class="site-header">Menu Login</div><div class="post-content"><h1>How to grow herbs indoors</h1><p>Start with a sunny windowsill and a well-drained pot.</p><ul><li>Water when the soil is dry.</li></ul></div><div class="share-tools">Share</div>', includes: ['sunny windowsill', 'Water when'], excludes: ['Menu Login', 'Share'] },
  { name: 'Documentation page', url: 'https://docs.example.com/guide', html: '<nav>Docs API Search</nav><main id="main-content"><h1>Install the package</h1><p>Run the install command from your terminal.</p><pre>npm install soundoc</pre><h2>Configuration</h2><p>Set the local preferences before starting.</p></main><footer>Privacy Cookies</footer>', includes: ['Run the install', 'Configuration'], excludes: ['Docs API', 'Privacy Cookies'] },
  { name: 'Heavy navigation', url: 'https://example.com/heavy', html: '<header>Home Home Home Search Login</header><nav>Home Search Login Home Search</nav><main><h1>A short article</h1><p>This is the useful article paragraph with enough detail for a listener.</p><p>It contains a second paragraph with meaningful information.</p></main>', includes: ['useful article paragraph'], excludes: ['Search Login'] },
  { name: 'Advertising page', url: 'https://example.com/ads', html: '<main><h1>Guide to better focus</h1><div class="advertisement">Buy this product now</div><p>Focus improves when distractions are removed from the workspace.</p><div class="related-content">You may also like these stories.</div></main>', includes: ['Focus improves'], excludes: ['Buy this product', 'You may also like'] },
  { name: 'No clear article', url: 'https://example.com/app', html: '<div class="menu">Home Search Login Pricing</div><div>Loading…</div>', suspicious: true },
  { name: 'Script-rendered page', url: 'https://example.com/script', html: '<header>Site navigation</header><main id="app"></main><script type="application/json">{"body":"loaded later"}</script>', suspicious: true },
];

export function runArticleExtractorFixtures() {
  return articleExtractorFixtures.map((fixture) => {
    const result = extractArticleFromHtml(fixture.html, fixture.url);
    fixture.includes?.forEach((value) => { if (!result.text.includes(value)) throw new Error(`${fixture.name}: expected ${value}`); });
    fixture.excludes?.forEach((value) => { if (result.text.includes(value)) throw new Error(`${fixture.name}: unexpectedly included ${value}`); });
    if (fixture.suspicious !== undefined && result.suspicious !== fixture.suspicious) throw new Error(`${fixture.name}: suspicious flag mismatch`);
    return { name: fixture.name, method: result.method, confidence: result.confidence, suspicious: result.suspicious };
  });
}

export function runReferenceRegressionFixture() {
  const html = '<article><h1>Study title</h1><section id="body"><p>The article body explains the result clearly.</p></section><section id="reference-list"><h2>References</h2><div class="ref">191. Author. A citation title. [ DOI ] [ PubMed ]</div></section></article>';
  const result = extractArticleFromHtml(html, 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123/');
  if (!result.text.includes('article body explains')) throw new Error('PMC body missing');
  if (result.text.includes('citation title') || result.text.includes('PubMed')) throw new Error('PMC references leaked into spoken text');
  return result;
}
