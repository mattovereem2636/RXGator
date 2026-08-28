#!/usr/bin/env node
/**
 * optum-scraper.js — Optum Perks drug pricing scraper
 *
 * Strategy: Use Puppeteer to visit each drug page on perks.optum.com
 * and intercept the prices API response. The page handles auth and
 * provides the correct API parameters automatically.
 *
 * Usage:
 *   node optum-scraper.js                     # scrape default drug list
 *   node optum-scraper.js --drugs metformin,lisinopril
 *   node optum-scraper.js --file drugs.txt    # one drug per line
 *
 * Deploy to: /var/www/rxaggregator/optum-scraper.js
 * Output:    /var/www/rxaggregator/data/optum_cache.json
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'data', 'optum_cache.json');
const BASE_URL = 'https://perks.optum.com';
const BETWEEN_DRUGS_DELAY = 3500;
const MAX_RETRIES = 1;

// Known URL slugs for top generics
// Format: { searchName: urlSlug }
// The slug often includes the formulation suffix (ir, er, hcl, etc.)
const DRUG_SLUGS = {
    // === ORIGINAL 50 (verified working) ===
    'metformin': 'metformin-ir',
    'lisinopril': 'lisinopril',
    'amlodipine': 'amlodipine',
    'atorvastatin': 'atorvastatin',
    'omeprazole': 'omeprazole',
    'losartan': 'losartan',
    'gabapentin': 'gabapentin',
    'sertraline': 'sertraline',
    'levothyroxine': 'levothyroxine',
    'simvastatin': 'simvastatin',
    'montelukast': 'montelukast-sodium',
    'hydrochlorothiazide': 'hydrochlorothiazide',
    'pantoprazole': 'pantoprazole-sodium',
    'escitalopram': 'escitalopram',
    'rosuvastatin': 'rosuvastatin',
    'fluoxetine': 'fluoxetine-hcl',
    'trazodone': 'trazodone',
    'meloxicam': 'meloxicam',
    'clopidogrel': 'clopidogrel',
    'tramadol': 'tramadol-ir',
    'prednisone': 'prednisone',
    'amoxicillin': 'amoxicillin',
    'azithromycin': 'azithromycin',
    'ciprofloxacin': 'ciprofloxacin',
    'doxycycline': 'doxycycline-hyclate',
    'metoprolol': 'metoprolol',
    'carvedilol': 'carvedilol',
    'furosemide': 'furosemide',
    'albuterol': 'albuterol',
    'duloxetine': 'duloxetine',
    'bupropion': 'bupropion',
    'venlafaxine': 'venlafaxine-er',
    'lamotrigine': 'lamotrigine',
    'topiramate': 'topiramate',
    'cyclobenzaprine': 'cyclobenzaprine',
    'benazepril': 'benazepril',
    'pravastatin': 'pravastatin',
    'glipizide': 'glipizide-er',
    'pioglitazone': 'pioglitazone',
    'cephalexin': 'cephalexin',
    'clindamycin': 'clindamycin',
    'valacyclovir': 'valacyclovir',
    'finasteride': 'finasteride',
    'tamsulosin': 'tamsulosin',
    'sildenafil': 'sildenafil',
    'ibuprofen': 'ibuprofen',
    'naproxen': 'naproxen',
    'diclofenac': 'diclofenac',
    'sumatriptan': 'sumatriptan',
    'buspirone': 'buspirone',
    // === HIGH PRIORITY — in 3+ other sources (88 drugs) ===
    'acarbose': 'acarbose',
    'acyclovir': 'acyclovir',
    'allopurinol': 'allopurinol',
    'aripiprazole': 'aripiprazole',
    'atenolol': 'atenolol',
    'baclofen': 'baclofen',
    'benzonatate': 'benzonatate',
    'budesonide': 'budesonide',
    'cabergoline': 'cabergoline',
    'carbamazepine': 'carbamazepine',
    'carisoprodol': 'carisoprodol',
    'celecoxib': 'celecoxib',
    'clarithromycin': 'clarithromycin',
    'clobazam': 'clobazam',
    'clonidine': 'clonidine',
    'clotrimazole': 'clotrimazole-cream',
    'clozapine': 'clozapine',
    'colchicine': 'colchicine',
    'desloratadine': 'desloratadine',
    'dexamethasone': 'dexamethasone',
    'diflunisal': 'diflunisal',
    'digoxin': 'digoxin',
    'dutasteride': 'dutasteride',
    'entacapone': 'entacapone',
    'eplerenone': 'eplerenone',
    'estradiol': 'estradiol',
    'eszopiclone': 'eszopiclone',
    'ethosuximide': 'ethosuximide',
    'etodolac': 'etodolac',
    'ezetimibe': 'ezetimibe',
    'famotidine': 'famotidine',
    'felbamate': 'felbamate',
    'fluconazole': 'fluconazole',
    'gemfibrozil': 'gemfibrozil',
    'glimepiride': 'glimepiride',
    'glyburide': 'glyburide-tablet',
    'glycopyrrolate': 'glycopyrrolate',
    'haloperidol': 'haloperidol',
    'hydrocortisone': 'hydrocortisone',
    'indomethacin': 'indomethacin',
    'irbesartan': 'irbesartan',
    'isoniazid': 'isoniazid',
    'lactulose': 'lactulose',
    'lansoprazole': 'lansoprazole',
    'latanoprost': 'latanoprost',
    'levetiracetam': 'levetiracetam',
    'levofloxacin': 'levofloxacin',
    'linezolid': 'zyvox',
    'mesalamine': 'mesalamine',
    'methimazole': 'methimazole',
    'methocarbamol': 'methocarbamol',
    'methylprednisolone': 'methylprednisolone',
    'metronidazole': 'metronidazole',
    'mirtazapine': 'mirtazapine',
    'misoprostol': 'misoprostol',
    'nateglinide': 'nateglinide',
    'nifedipine': 'nifedipine',
    'nitrofurantoin': 'nitrofurantoin-macrocrystals',
    'olanzapine': 'olanzapine',
    'ondansetron': 'ondansetron',
    'oxcarbazepine': 'oxcarbazepine',
    'paliperidone': 'paliperidone-er',
    'phenytoin': 'phenytoin',
    'piroxicam': 'piroxicam',
    'prednisolone': 'prednisolone',
    'pregabalin': 'pregabalin',
    'primidone': 'primidone',
    'progesterone': 'progesterone',
    'pyrazinamide': 'pyrazinamide',
    'ramipril': 'ramipril',
    'ranolazine': 'ranolazine-er',
    'repaglinide': 'repaglinide',
    'rifampin': 'rifampin',
    'riluzole': 'riluzole',
    'risperidone': 'risperidone',
    'rufinamide': 'rufinamide',
    'salsalate': 'salsalate',
    'spironolactone': 'spironolactone',
    'sucralfate': 'sucralfate',
    'sulindac': 'sulindac',
    'tadalafil': 'tadalafil',
    'testosterone': 'testosterone',
    'tetrabenazine': 'tetrabenazine',
    'tretinoin': 'tretinoin',
    'trimethoprim': 'trimethoprim',
    'ursodiol': 'ursodiol',
    'valsartan': 'valsartan',
    'zafirlukast': 'zafirlukast',
    // === MEDIUM PRIORITY — in 2 other sources (101 drugs) ===
    'alendronate': 'alendronate',
    'alfuzosin': 'alfuzosin-er',
    'aliskiren': 'aliskiren',
    'alprazolam': 'alprazolam',
    'amiodarone': 'amiodarone',
    'amitriptyline': 'amitriptyline-hcl',
    'atomoxetine': 'atomoxetine',
    'benztropine': 'benztropine',
    'brimonidine': 'brimonidine',
    'brivaracetam': 'brivaracetam',
    'bromocriptine': 'bromocriptine',
    'capsaicin': 'capsaicin',
    'carbidopa-levodopa': 'carbidopa-levodopa',
    'cetirizine': 'cetirizine',
    'cholestyramine': 'cholestyramine',
    'citalopram': 'citalopram',
    'clonazepam': 'clonazepam',
    'colesevelam': 'colesevelam',
    'cromolyn': 'cromolyn-oral',
    'darifenacin': 'darifenacin-er',
    'desmopressin': 'desmopressin-acetate',
    'dexlansoprazole': 'dexlansoprazole',
    'diazepam': 'diazepam',
    'dicyclomine': 'dicyclomine',
    'divalproex': 'divalproex',
    'donepezil': 'donepezil',
    'doxazosin': 'doxazosin',
    'doxepin': 'doxepin',
    'erythromycin': 'erythromycin-ethylsuccinate',
    'ethambutol': 'ethambutol',
    'fenofibrate': 'fenofibrate',
    'fludrocortisone': 'fludrocortisone-acetate',
    'fluvoxamine': 'fluvoxamine',
    'granisetron': 'granisetron',
    'guaifenesin': 'guaifenesin',
    'guanfacine': 'guanfacine',
    'hydralazine': 'hydralazine',
    'hydroxychloroquine': 'hydroxychloroquine-sulfate',
    'ibandronate': 'ibandronate',
    'isosorbide-mononitrate': 'isosorbide-mononitrate',
    'ketoconazole': 'ketoconazole',
    'ketorolac': 'ketorolac',
    'lacosamide': 'lacosamide',
    'lanthanum': 'lanthanum',
    'levocetirizine': 'levocetirizine',
    'lisinopril-hctz': 'lisinopril-hydrochlorothiazide',
    'loperamide': 'loperamide',
    'lorazepam': 'lorazepam',
    'losartan-hctz': 'losartan-hydrochlorothiazide',
    'lubiprostone': 'lubiprostone',
    'medroxyprogesterone': 'medroxyprogesterone-acetate',
    'memantine': 'memantine',
    'methotrexate': 'methotrexate',
    'methylphenidate': 'methylphenidate',
    'miglitol': 'miglitol',
    'minocycline': 'minocycline',
    'mirabegron': 'myrbetriq',
    'mometasone': 'mometasone',
    'moxifloxacin': 'moxifloxacin',
    'mupirocin': 'mupirocin',
    'naltrexone': 'naltrexone',
    'norethindrone': 'norethindrone',
    'nortriptyline': 'nortriptyline',
    'nystatin': 'nystatin',
    'olmesartan': 'olmesartan',
    'oseltamivir': 'oseltamivir',
    'oxybutynin': 'oxybutynin',
    'penicillin-v': 'penicillin-v',
    'perampanel': 'perampanel',
    'permethrin': 'permethrin',
    'phenazopyridine': 'phenazopyridine',
    'pramipexole': 'pramipexole',
    'prochlorperazine': 'prochlorperazine',
    'promethazine': 'promethazine',
    'propylthiouracil': 'propylthiouracil',
    'quetiapine': 'quetiapine',
    'raloxifene': 'raloxifene',
    'risedronate': 'risedronate',
    'rivaroxaban': 'rivaroxaban',
    'rizatriptan': 'rizatriptan',
    'roflumilast': 'roflumilast',
    'ropinirole': 'ropinirole',
    'solifenacin': 'solifenacin',
    'terazosin': 'terazosin',
    'tetracycline': 'tetracycline',
    'theophylline': 'theophylline',
    'tiagabine': 'tiagabine',
    'ticagrelor': 'ticagrelor',
    'timolol': 'timolol',
    'tizanidine': 'tizanidine',
    'tolterodine': 'tolterodine',
    'tolvaptan': 'tolvaptan',
    'trihexyphenidyl': 'trihexyphenidyl',
    'trospium': 'trospium-chloride',
    'valproic-acid': 'valproic-acid',
    'vigabatrin': 'vigabatrin',
    'warfarin': 'warfarin'
};

function parseArgs() {
    const args = process.argv.slice(2);
    const config = { drugs: Object.keys(DRUG_SLUGS) };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--drugs' && args[i + 1]) {
            config.drugs = args[i + 1].split(',').map(d => d.trim().toLowerCase());
            i++;
        } else if (args[i] === '--file' && args[i + 1]) {
            const content = fs.readFileSync(args[i + 1], 'utf8');
            config.drugs = content.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
            i++;
        }
    }
    return config;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Visit a drug page and intercept the prices API response
async function scrapeDrug(page, drugName) {
    const slug = DRUG_SLUGS[drugName] || drugName;
    const drugUrl = `${BASE_URL}/drug/${slug}`;

    // Set up response interceptor for this drug's prices
    let pricesResponse = null;
    let drugPageTitle = '';

    const responseHandler = async (response) => {
        const url = response.url();
        if (url.includes('optumperks/v1/prices')) {
            try {
                const json = await response.json();
                pricesResponse = json;
            } catch (e) {
                // Response already consumed or invalid
            }
        }
    };
    page.on('response', responseHandler);

    try {
        await page.goto(drugUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await delay(3000);

        // Check if we got a 404 page
        const is404 = await page.evaluate(() => {
            return document.body.innerText.includes('Error 404') || document.body.innerText.includes("couldn't find the page");
        });

        if (is404) {
            page.off('response', responseHandler);
            console.log(`  [SKIP] ${drugName}: /drug/${slug} returned 404`);
            return null;
        }

        // Extract drug details from the page
        const pageData = await page.evaluate(() => {
            const text = document.body.innerText;
            const title = document.querySelector('h1')?.textContent?.trim() || '';
            const formMatch = text.match(/Form\n(\w[\w\s]*?)(?:\n|$)/);
            const dosageMatch = text.match(/Dosage\n([\d.]+\s*\w+)/);
            const quantityMatch = text.match(/Quantity\n([\d]+\s*\w+)/);
            return {
                title: title,
                form: formMatch ? formMatch[1].trim() : '',
                strength: dosageMatch ? dosageMatch[1].trim() : '',
                quantity: quantityMatch ? quantityMatch[1].trim() : ''
            };
        });

        // Wait a bit more for prices API to complete
        if (!pricesResponse) await delay(3000);

        page.off('response', responseHandler);

        // If we captured the API response, parse it
        if (pricesResponse) {
            const prices = [];
            // The response could be an array or an object with prices
            const entries = Array.isArray(pricesResponse) ? pricesResponse :
                           (pricesResponse.pharmacyPricings || pricesResponse.prices ||
                            pricesResponse.data || pricesResponse.results || []);

            for (const entry of entries) {
                // Optum API: retailer.name for pharmacy, price can be number or object
                const pharmacy = (entry.retailer && entry.retailer.name) ||
                                entry.pharmacyName || entry.pharmacy || entry.name || '';
                let price = 0;
                if (typeof entry.price === 'number') {
                    price = entry.price;
                } else if (typeof entry.price === 'string') {
                    price = parseFloat(entry.price.replace(/[^0-9.]/g, ''));
                } else if (entry.price && typeof entry.price === 'object') {
                    price = parseFloat(entry.price.amount || entry.price.value || entry.price.discountPrice || 0);
                }

                if (pharmacy && price > 0) {
                    prices.push({
                        pharmacy: pharmacy,
                        price: price,
                        type: entry.fulfillmentType || entry.priceType || 'coupon'
                    });
                }
            }

            if (prices.length > 0) {
                const priceValues = prices.map(p => p.price);
                const result = {
                    name: pageData.title || drugName,
                    slug: slug,
                    strength: pageData.strength,
                    form: pageData.form,
                    quantity: pageData.quantity,
                    lowestPrice: Math.min(...priceValues),
                    highestPrice: Math.max(...priceValues),
                    pharmacyCount: prices.length,
                    prices: prices,
                    url: drugUrl,
                    scrapedAt: new Date().toISOString()
                };
                console.log(`  [OK]   ${drugName} → ${slug}: ${prices.length} pharmacies, $${result.lowestPrice.toFixed(2)} - $${result.highestPrice.toFixed(2)} (API)`);
                return result;
            }
        }

        // Fallback: parse prices from page text
        const pageText = await page.evaluate(() => document.body.innerText);
        const prices = [];

        // Pattern: $PRICE\nPharmacy Name\n(Best price)?\nGet Rx Coupon
        const pricePattern = /\$(\d+\.?\d*)\n([A-Za-z][\w\s&'().-]+?)(?:\nBest price)?\nGet (?:Rx Coupon|Delivery)/g;
        let match;
        while ((match = pricePattern.exec(pageText)) !== null) {
            const price = parseFloat(match[1]);
            const pharmacy = match[2].trim();
            if (price > 0 && pharmacy.length < 50) {
                prices.push({ pharmacy, price, type: 'coupon' });
            }
        }

        // Optum Perks delivery price
        const deliveryMatch = pageText.match(/\$(\d+\.?\d*)\nOptum Perks prescription delivery/);
        if (deliveryMatch) {
            prices.push({
                pharmacy: 'Optum Perks Home Delivery',
                price: parseFloat(deliveryMatch[1]),
                type: 'home delivery'
            });
        }

        if (prices.length > 0) {
            const priceValues = prices.map(p => p.price);
            const result = {
                name: pageData.title || drugName,
                slug: slug,
                strength: pageData.strength,
                form: pageData.form,
                quantity: pageData.quantity,
                lowestPrice: Math.min(...priceValues),
                highestPrice: Math.max(...priceValues),
                pharmacyCount: prices.length,
                prices: prices,
                url: drugUrl,
                scrapedAt: new Date().toISOString()
            };
            console.log(`  [OK]   ${drugName} → ${slug}: ${prices.length} pharmacies, $${result.lowestPrice.toFixed(2)} - $${result.highestPrice.toFixed(2)} (text)`);
            return result;
        }

        console.log(`  [SKIP] ${drugName}: no prices found`);
        return null;

    } catch (err) {
        page.off('response', responseHandler);
        console.error(`  [ERR]  ${drugName}: ${err.message}`);
        return null;
    }
}

async function main() {
    const config = parseArgs();
    const startTime = new Date();

    console.log(`\n[Optum Scraper] Starting at ${startTime.toISOString()}`);
    console.log(`[Optum Scraper] ${config.drugs.length} drugs to scrape\n`);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 800 });

    // Block images/fonts/media
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'font', 'media'].includes(type)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    const drugs = {};
    let successCount = 0;
    let skipCount = 0;

    for (const drugName of config.drugs) {
        let result = null;
        let attempts = 0;

        while (attempts <= MAX_RETRIES && !result) {
            if (attempts > 0) {
                console.log(`  [RETRY] ${drugName}`);
                await delay(5000);
            }
            result = await scrapeDrug(page, drugName);
            attempts++;
        }

        if (result) {
            drugs[result.slug] = result;
            successCount++;
        } else {
            skipCount++;
        }

        await delay(BETWEEN_DRUGS_DELAY);
    }

    await browser.close();

    const cache = {
        source: 'Optum Perks',
        sourceUrl: BASE_URL,
        description: 'Optum Perks prescription discount prices.',
        generatedAt: new Date().toISOString(),
        drugCount: Object.keys(drugs).length,
        priceCount: Object.values(drugs).reduce((sum, d) => sum + d.prices.length, 0),
        drugs: drugs
    };

    const cacheDir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

    const elapsed = ((Date.now() - startTime.getTime()) / 1000).toFixed(1);
    console.log(`\n[Optum Scraper] Done in ${elapsed}s`);
    console.log(`[Optum Scraper] ${successCount} drugs, ${skipCount} skipped`);
    console.log(`[Optum Scraper] Cache: ${CACHE_PATH} (${cache.drugCount} drugs, ${cache.priceCount} prices)\n`);
}

main().catch(err => {
    console.error('[Optum Scraper] Fatal:', err.message);
    process.exit(1);
});
