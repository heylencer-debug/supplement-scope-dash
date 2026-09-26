// Hand-written HTML fixtures for P5b tests: an affiliate review, a brand page,
// a syndicated copy of the review, a sponsored post, an independent guide and
// a reddit thread. No real site's text is reproduced.
'use strict';

const REVIEW_BODY = `
<p>We spent six weeks testing twelve magnesium gummies for taste, dose and price.
Our favourite overall is the Calmwell Magnesium Glycinate Gummies because each serving delivers 200 mg of elemental magnesium and the texture never turned chalky.</p>
<h2>How we compared them</h2>
<p>We compared elemental magnesium per serving, the form of magnesium used, sugar per serving and cost per serving across every product.</p>
<p>Magnesium glycinate is clinically proven to improve sleep quality in adults with poor sleep, according to the studies we reviewed.</p>
<p>The biggest weakness of the RestEasy gummies is the 4 grams of added sugar per serving, which adds up quickly if you take two a day.</p>
<p>Calmwell costs $24.99 for 60 gummies, which works out to roughly $0.83 per serving.</p>
<p>Calmwell says it is NSF certified, and we confirmed the listing ourselves.</p>
<p>See the <a href="https://pubmed.ncbi.nlm.nih.gov/12345678/">sleep study we cite</a> for details on the dose used.</p>
<p>Buy it: <a href="https://amzn.to/3abcXYZ">Calmwell on Amazon</a> or <a href="https://www.amazon.com/dp/B0ABCDEF12?tag=gummyreviews-20">check price</a>.</p>
`;

const affiliateReview = `<!doctype html><html><head>
<title>The 12 Best Magnesium Gummies of 2026, Tested</title>
<meta name="description" content="We tested twelve magnesium gummies.">
<meta property="article:published_time" content="2026-03-01T10:00:00Z">
</head><body>
<header><nav><a href="/">Home</a> <a href="/sleep">Sleep</a></nav>
<p class="disclosure">When you buy through links on our site, we may earn a commission at no extra cost to you.</p></header>
<article><h1>The 12 Best Magnesium Gummies of 2026, Tested</h1>${REVIEW_BODY}</article>
<footer><p>Affiliate disclosure: see our policy.</p></footer>
<script>var tracking = "ignore me";</script>
</body></html>`;

// Same article re-posted on a content farm, with its own chrome, one line changed.
const syndicatedCopy = `<!doctype html><html><head>
<title>Best Magnesium Gummies 2026 | HealthNewsDaily</title>
<meta property="article:published_time" content="2026-03-05T10:00:00Z">
</head><body><nav><a href="/">HealthNewsDaily</a></nav>
<main><h1>Best Magnesium Gummies (Reposted)</h1>${REVIEW_BODY}<p>Originally published elsewhere.</p></main>
</body></html>`;

const brandPage = `<!doctype html><html><head>
<title>Magnesium Glycinate Gummies | Calmwell</title>
<meta property="og:site_name" content="Calmwell">
</head><body><header><nav><a href="/shop">Shop</a></nav></header>
<main><h1>Magnesium Glycinate Gummies</h1>
<p>Our formula uses fully chelated magnesium glycinate for gentle, calming support every night.</p>
<p>Each serving provides 200 mg of elemental magnesium with only 1 gram of sugar.</p>
<p>Clinically studied magnesium glycinate supports restful sleep and muscle relaxation.</p>
<p>Third-party tested for purity and potency in an ISO-accredited lab.</p>
<button>Add to cart</button> <span>$24.99</span>
</main></body></html>`;

const sponsoredPost = `<!doctype html><html><head><title>Why I switched to RestEasy magnesium gummies</title></head><body>
<article><h1>Why I switched to RestEasy magnesium gummies</h1>
<p><em>This post is sponsored by RestEasy. All opinions are my own.</em></p>
<p>I have tried a lot of sleep supplements, and RestEasy gummies are the first ones that helped me fall asleep faster without feeling groggy in the morning.</p>
<p>They taste like fresh raspberries and I never forget to take them before bed, which matters more than any label claim.</p>
</article></body></html>`;

const independentGuide = `<!doctype html><html><head><title>Magnesium gummies buying guide: what to look for</title></head><body>
<article><h1>Magnesium gummies buying guide: what to look for</h1>
<p>Most gummies contain far less magnesium than capsules because the mineral is bulky and bitter, so check the elemental magnesium per serving before anything else.</p>
<p>Look at the form of magnesium: glycinate and citrate are better absorbed than oxide in most studies.</p>
<p>Many gummies carry 3 to 5 grams of sugar per serving, which is worth comparing if you take them daily.</p>
<p>We have no relationships with any brand mentioned here and we do not use affiliate links.</p>
</article></body></html>`;

const redditThread = `<!doctype html><html><head><title>Anyone tried Calmwell magnesium gummies? : r/Supplements</title></head><body>
<div class="thread"><p>I have been taking Calmwell for a month. Sleep is better but honestly the taste is a bit bitter after a week and the bottle only lasts 30 days at two a day.</p>
<p>Reply: Same experience, the bitter aftertaste is real but it works for my cramps.</p></div>
</body></html>`;

const amazonListingText = 'Each serving delivers 200 mg of elemental magnesium in a delicious gummy. Magnesium glycinate is clinically proven to improve sleep quality in adults with poor sleep. Vegan, gluten free and made in the USA.';

module.exports = { affiliateReview, syndicatedCopy, brandPage, sponsoredPost, independentGuide, redditThread, amazonListingText };
