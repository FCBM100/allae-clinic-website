/**
 * Seed script: pushes the clinic's current gallery images & captions into
 * Supabase (Storage + the `gallery` table) as real database records.
 *
 * Usage:
 *   node tools/seed-gallery.mjs            # seed only if the table is empty
 *   node tools/seed-gallery.mjs --force    # wipe the table + files and reseed
 *
 * Credentials come from .env.gallery (GALLERY_ADMIN_EMAIL / GALLERY_ADMIN_PASSWORD)
 * or from environment variables.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
    const envPath = join(ROOT, '.env.gallery');
    const env = {};
    if (existsSync(envPath)) {
        for (const line of readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
    for (const [k, v] of Object.entries(process.env)) env[k] = v;
    return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = env.GALLERY_ADMIN_EMAIL || process.env.GALLERY_ADMIN_EMAIL;
const ADMIN_PASSWORD = env.GALLERY_ADMIN_PASSWORD || process.env.GALLERY_ADMIN_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Missing credentials. Provide SUPABASE_URL, SUPABASE_ANON_KEY, GALLERY_ADMIN_EMAIL, GALLERY_ADMIN_PASSWORD (in .env.gallery or env).');
    process.exit(1);
}

const BUCKET = env.GALLERY_BUCKET || 'gallery-images';
const FORCE = process.argv.includes('--force');

// Manifest mirrors the clinic's current on-site gallery (labels + order).
const SEED_DIR = join(ROOT, '.gallery-seed');
const MANIFEST = [
    { file: '01-before-after.jpg', label: 'قبل / بعد', description: 'نموذج توضيحي لنتائج علاجية واقعية ضمن عيادتنا', is_tall: false },
    { file: '02-before-after.jpg', label: 'قبل / بعد', description: 'نتائج طبيعية بعد جلسات معتمدة', is_tall: false },
    { file: '03-filler-results.jpg', label: 'نتائج الفيلر', description: 'نتائج حقن الفيلر مع أحدث التقنيات', is_tall: true },
    { file: '04-before-after.jpg', label: 'قبل / بعد', description: 'تحسين واضح بجلسات قليلة', is_tall: false },
    { file: '05-modern-devices.jpg', label: 'أجهزة حديثة', description: 'أحدث أجهزة التجميل والليزر', is_tall: false },
    { file: '06-comfortable-space.jpg', label: 'بيئة مريحة', description: 'أجواء هادئة ومريحة داخل العيادة', is_tall: false }
];

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function log(...args) { console.log('[seed]', ...args); }

async function currentCount() {
    const { data, error } = await client.from('gallery').select('id');
    if (error) throw error;
    return (data || []).length;
}

async function signIn() {
    const { data, error } = await client.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
    });
    if (error) throw new Error('Admin sign-in failed: ' + error.message);
    log('Signed in as', ADMIN_EMAIL);
    return data;
}

async function readImage(file) {
    const path = join(SEED_DIR, file);
    if (!existsSync(path)) throw new Error('Missing seed image: ' + path);
    return readFileSync(path);
}

function findType(initials) {
    const first = initials[0];
    if (!initials.length) return 'image/jpeg';
    if (first === 0xff && initials[1] === 0xd8) return 'image/jpeg';
    if (initials.toString('ascii', 0, 4) === '\x89PNG') return 'image/png';
    if (initials.toString('ascii', 0, 4) === 'RIFF') return 'image/webp';
    return 'image/jpeg';
}

async function wipe() {
    log('Wiping existing gallery rows...');
    const { data, error } = await client.from('gallery').select('id, storage_path');
    if (error) throw error;
    for (const row of data || []) {
        if (row.storage_path) {
            await client.storage.from(BUCKET).remove([row.storage_path]);
        }
    }
    const { error: delErr } = await client.from('gallery').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) throw delErr;
    log('Wiped', (data || []).length, 'rows');
}

async function seed() {
    await signIn();

    if (FORCE) await wipe();

    const count = await currentCount();
    if (count > 0) {
        log(`Table already has ${count} row(s). Use --force to reseed.`);
        return;
    }

    for (let i = 0; i < MANIFEST.length; i++) {
        const entry = MANIFEST[i];
        const buffer = await readImage(entry.file);
        const type = findType(buffer);
        const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
        const fileName = basename(entry.file, extname(entry.file));
        const storagePath = `gallery/${fileName}-${Date.now()}-${i}.${ext}`;

        log('Uploading', entry.file, '->', storagePath);
        const { data: up, error: upErr } = await client.storage
            .from(BUCKET)
            .upload(storagePath, buffer, {
                contentType: type,
                cacheControl: '3600',
                upsert: true
            });
        if (upErr) throw upErr;

        const row = {
            label: entry.label,
            description: entry.description,
            storage_path: up.path,
            is_tall: entry.is_tall,
            position: i + 1
        };
        const { error: insErr } = await client.from('gallery').insert(row);
        if (insErr) throw insErr;
    }
    log('Seeded', MANIFEST.length, 'gallery items.');
}

seed().catch((e) => {
    console.error('[seed] FAILED:', e.message);
    process.exit(1);
});