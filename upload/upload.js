import fs from 'fs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// define __dirname first
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ArticleSchema = new mongoose.Schema({}, { strict: false });
const Article = mongoose.model('Article', ArticleSchema);

const ENRICHED_PATH = path.resolve(__dirname, '../data/enriched/articles.enriched.json');

async function load() {
	try {
		await mongoose.connect(process.env.MONGO_URI);

		const raw = fs.readFileSync(ENRICHED_PATH, 'utf-8');
		const data = JSON.parse(raw);

		await Article.insertMany(data, { ordered: false });
		console.log('Data imported successfully');

		process.exit(0);
	} catch (err) {
		console.error('Import failed:', err.message);
		process.exit(1);
	}
}

load();
