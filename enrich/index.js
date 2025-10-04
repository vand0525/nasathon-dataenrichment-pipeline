import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export const INPUT_PATH = path.resolve(__dirname, '../data/parsed/articles.json');
export const OUT_JSON = path.resolve(process.cwd(), '../data/enriched/articles.enriched.json');

async function getEnrichment(article) {
	const payload = {
		pmid: article.pmid,
		title: article.title,
		abstract: (article.abstract ?? '').slice(0, 2000),
		journal: article.journal,
		year: article.year,
	};

	const completion = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
		temperature: 0,
		messages: [
			{
				role: 'system',
				content: 'You enrich research articles with summaries, tags, key terms, and quotes.',
			},
			{
				role: 'user',
				content: `Here is an article object:\n${JSON.stringify(payload)}\nReturn ONLY the enriched JSON.`,
			},
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'article_enrichment',
				strict: true,
				schema: {
					type: 'object',
					properties: {
						tl_dr: {
							type: 'string',
							description: 'One-sentence plain-language summary of the article',
						},
						tags: {
							type: 'array',
							items: { type: 'string' },
							description: 'Freeform tags (3–5 recommended)',
						},
						key_terms: {
							type: 'array',
							items: { type: 'string' },
							description: '3–5 important phrases from the abstract',
						},
						quotes: {
							type: 'array',
							items: { type: 'string' },
							maxItems: 2,
							description: 'Up to 2 short verbatim snippets from the abstract',
						},
					},
					required: ['tl_dr', 'tags', 'key_terms', 'quotes'],
					additionalProperties: false,
				},
			},
		},
	});

	const raw = completion.choices?.[0]?.message?.content ?? '';
	if (!raw.trim()) throw new Error('empty completion');

	return JSON.parse(raw);
}

async function getEmbedding(text) {
	const resp = await openai.embeddings.create({
		model: 'text-embedding-3-small',
		input: text,
	});

	const vec = resp.data?.[0]?.embedding;
	if (!Array.isArray(vec)) throw new Error('embedding missing in response');
	return vec;
}

function getBasis({ title = '', abstract = '', tl_dr = '' }) {
	const safeAbstract = abstract ? abstract.slice(0, 2000) : '';
	const basis = `${title}\n\n${safeAbstract}\n\n${tl_dr}`;
	return basis.length > 6000 ? basis.slice(0, 6000) : basis;
}

async function processOne(article) {
	const enrichment = await getEnrichment(article);
	const enrichedArticle = { ...article, ...enrichment };
	const embedding = await getEmbedding(getBasis(enrichedArticle));
	return { ...enrichedArticle, embedding };
}

async function processAll(articles) {
	const BATCH_SIZE = 15;
	const allResults = [];

	for (let i = 0; i < articles.length; i += BATCH_SIZE) {
		const batch = articles.slice(i, i + BATCH_SIZE);

		console.log(`Processing batch ${i + 1}–${i + batch.length}`);

		const results = await Promise.all(
			batch.map((article) =>
				processOne(article).catch((e) => {
					console.error(`Failed for article ${article.pmid || '(no id)'}`, e);
					return null;
				})
			)
		);

		const successful = results.filter((r) => r !== null);
		allResults.push(...successful);

		console.log(`Batch complete, ${successful.length} succeeded`);
	}

	console.log('All batches complete');
	return allResults;
}

function writeAll(obj) {
	fs.writeFileSync(OUT_JSON, JSON.stringify(obj, null, 2), 'utf8');
}

function dedupeByPmid(articles) {
	const map = new Map();

	for (const a of articles) {
		const id = a.pmid || a.doi || `hash:${contentHash(a)}`;
		const prev = map.get(id);
		if (!prev || (a.title?.length || 0) + (a.abstract?.length || 0) > (prev.title?.length || 0) + (prev.abstract?.length || 0)) {
			map.set(id, a);
		}
	}

	return Array.from(map.values());
}

async function main() {
	const articles = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

	const filtered = articles.filter((a) => {
		const title = a.title?.trim();
		const abs = a.abstract?.trim();
		return title || abs;
	});

	const enriched = await processAll(filtered);
	const deduped = dedupeByPmid(enriched);

	writeAll(deduped);
}

main();
