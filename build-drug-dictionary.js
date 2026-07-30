#!/usr/bin/env node
/**
 * build-drug-dictionary.js
 *
 * Pulls data from RxNorm + openFDA APIs to build:
 *   - drug-names.json  (client-side Fuse.js autocomplete dictionary)
 *   - brand-generic-lookup.json  (enriched server-side O(1) lookup)
 *
 * Data sources:
 *   1. Existing brand-generic-map.json (179 curated entries)
 *   2. RxNorm API — getDrugs, approximateTerm, related concepts
 *   3. openFDA NDC Directory — brand_name, generic_name, dosage_form
 *   4. Existing caches (Walmart $4, Amazon RxPass, Cost Plus, etc.)
 *
 * Run: node build-drug-dictionary.js
 * Output: drug-names.json, brand-generic-lookup.json (updated)
 */

const fs = require('fs');
const path = require('path');

// Rate limiting for RxNorm (20 req/sec) and openFDA (40 req/min without key)
const RXNORM_DELAY = 120;  // ms between RxNorm calls
const OPENFDA_DELAY = 1600; // ms between openFDA calls

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

// ============================================================
// STEP 1: Load existing data sources
// ============================================================

function loadExistingData() {
  const existing = {};

  // Load brand-generic-map.json
  try {
    const mapData = JSON.parse(fs.readFileSync(path.join(__dirname, 'brand-generic-map.json'), 'utf8'));
    for (const entry of mapData.mappings || []) {
      const key = entry.generic.toLowerCase();
      if (!existing[key]) {
        existing[key] = {
          generic: entry.generic.toLowerCase(),
          brands: [entry.brand],
          drugClass: entry.drugClass || '',
          primaryUse: entry.primaryUse || '',
          hasGeneric: entry.hasGeneric !== false,
          typicalSavings: entry.typicalSavings || '',
          aliases: [],
          commonMisspellings: [],
        };
      } else {
        if (!existing[key].brands.includes(entry.brand)) {
          existing[key].brands.push(entry.brand);
        }
      }
    }
    console.log(`[LOAD] brand-generic-map.json: ${Object.keys(existing).length} generics`);
  } catch (e) {
    console.log('[LOAD] No brand-generic-map.json found, starting fresh');
  }

  return existing;
}

// ============================================================
// STEP 2: Top 300 most prescribed US drugs + common OTC
// ============================================================

const TOP_DRUGS = [
  // Top 50 most prescribed (2024 data)
  'lisinopril', 'atorvastatin', 'metformin', 'amlodipine', 'metoprolol',
  'omeprazole', 'simvastatin', 'losartan', 'albuterol', 'gabapentin',
  'hydrochlorothiazide', 'sertraline', 'levothyroxine', 'acetaminophen',
  'amoxicillin', 'furosemide', 'pantoprazole', 'montelukast', 'rosuvastatin',
  'escitalopram', 'bupropion', 'fluoxetine', 'trazodone', 'prednisone',
  'tamsulosin', 'citalopram', 'ibuprofen', 'carvedilol', 'tramadol',
  'meloxicam', 'pravastatin', 'duloxetine', 'venlafaxine', 'clonazepam',
  'alprazolam', 'cyclobenzaprine', 'naproxen', 'methylphenidate', 'cetirizine',
  'loratadine', 'fluticasone', 'azithromycin', 'cephalexin', 'doxycycline',
  'ciprofloxacin', 'amoxicillin/clavulanate', 'sulfamethoxazole/trimethoprim',
  'clindamycin', 'metronidazole', 'nitrofurantoin',

  // 51-100
  'ondansetron', 'famotidine', 'ranitidine', 'lansoprazole', 'esomeprazole',
  'propranolol', 'atenolol', 'diltiazem', 'verapamil', 'nifedipine',
  'lisinopril/hctz', 'losartan/hctz', 'valsartan', 'irbesartan', 'olmesartan',
  'candesartan', 'telmisartan', 'benazepril', 'enalapril', 'ramipril',
  'quinapril', 'fosinopril', 'spironolactone', 'chlorthalidone', 'triamterene/hctz',
  'warfarin', 'clopidogrel', 'apixaban', 'rivaroxaban', 'aspirin',
  'ticagrelor', 'prasugrel', 'digoxin', 'amiodarone', 'flecainide',
  'sotalol', 'doxazosin', 'terazosin', 'prazosin', 'finasteride',
  'dutasteride', 'sildenafil', 'tadalafil', 'oxybutynin', 'tolterodine',
  'solifenacin', 'mirabegron', 'phenazopyridine', 'potassium chloride', 'magnesium oxide',

  // 101-150
  'paroxetine', 'fluvoxamine', 'mirtazapine', 'nortriptyline', 'amitriptyline',
  'desipramine', 'imipramine', 'clomipramine', 'buspirone', 'hydroxyzine',
  'lorazepam', 'diazepam', 'temazepam', 'zolpidem', 'eszopiclone',
  'suvorexant', 'quetiapine', 'aripiprazole', 'risperidone', 'olanzapine',
  'ziprasidone', 'haloperidol', 'lithium', 'lamotrigine', 'carbamazepine',
  'valproic acid', 'divalproex', 'topiramate', 'levetiracetam', 'phenytoin',
  'oxcarbazepine', 'pregabalin', 'primidone', 'ethosuximide', 'lacosamide',
  'donepezil', 'memantine', 'rivastigmine', 'galantamine', 'pramipexole',
  'ropinirole', 'carbidopa/levodopa', 'entacapone', 'benztropine', 'amantadine',
  'baclofen', 'tizanidine', 'methocarbamol', 'carisoprodol', 'dantrolene',

  // 151-200
  'glipizide', 'glyburide', 'glimepiride', 'pioglitazone', 'sitagliptin',
  'empagliflozin', 'dapagliflozin', 'canagliflozin', 'liraglutide', 'semaglutide',
  'dulaglutide', 'insulin glargine', 'insulin lispro', 'insulin aspart',
  'metformin/sitagliptin', 'metformin/glipizide', 'acarbose',
  'allopurinol', 'colchicine', 'febuxostat', 'probenecid',
  'prednisone', 'prednisolone', 'methylprednisolone', 'dexamethasone',
  'hydrocortisone', 'fludrocortisone', 'methotrexate', 'hydroxychloroquine',
  'sulfasalazine', 'leflunomide', 'azathioprine', 'mycophenolate',
  'tacrolimus', 'cyclosporine', 'adalimumab', 'etanercept',
  'alendronate', 'risedronate', 'ibandronate', 'raloxifene',
  'calcitriol', 'ergocalciferol', 'cholecalciferol', 'calcium carbonate',
  'ferrous sulfate', 'folic acid', 'cyanocobalamin', 'thiamine',
  'pyridoxine', 'ascorbic acid',

  // 201-250 (respiratory, dermatology, ophthalmology)
  'fluticasone/salmeterol', 'budesonide', 'budesonide/formoterol', 'tiotropium',
  'ipratropium', 'ipratropium/albuterol', 'levalbuterol', 'theophylline',
  'guaifenesin', 'dextromethorphan', 'benzonatate', 'codeine',
  'hydrocodone/acetaminophen', 'oxycodone', 'oxycodone/acetaminophen',
  'morphine', 'fentanyl', 'buprenorphine', 'naloxone', 'naltrexone',
  'methadone', 'suboxone', 'clonidine',
  'mupirocin', 'clotrimazole', 'ketoconazole', 'terbinafine', 'nystatin',
  'fluconazole', 'acyclovir', 'valacyclovir', 'oseltamivir',
  'permethrin', 'ivermectin', 'tretinoin', 'adapalene', 'benzoyl peroxide',
  'hydroquinone', 'tacrolimus topical', 'clobetasol', 'triamcinolone',
  'betamethasone', 'mometasone', 'desonide',
  'latanoprost', 'timolol', 'brimonidine', 'dorzolamide',
  'travoprost', 'bimatoprost',

  // 251-300 (endocrine, GI, other)
  'estradiol', 'conjugated estrogens', 'medroxyprogesterone', 'norethindrone',
  'levonorgestrel', 'ethinyl estradiol', 'desogestrel',
  'methimazole', 'propylthiouracil', 'desmopressin',
  'sucralfate', 'dicyclomine', 'hyoscyamine', 'loperamide', 'bismuth subsalicylate',
  'polyethylene glycol', 'lactulose', 'docusate', 'senna', 'psyllium',
  'misoprostol', 'ursodiol', 'cholestyramine',
  'isosorbide mononitrate', 'isosorbide dinitrate', 'nitroglycerin', 'hydralazine',
  'minoxidil', 'nitroprusside',
  'erythromycin', 'clarithromycin', 'levofloxacin', 'moxifloxacin',
  'gentamicin', 'tobramycin', 'vancomycin', 'linezolid',
  'phenobarbital', 'chlorpromazine', 'promethazine', 'prochlorperazine',
  'metoclopramide', 'trimethobenzamide', 'scopolamine', 'meclizine',
];

// ============================================================
// STEP 3: Common aliases and misspellings
// ============================================================

const KNOWN_ALIASES = {
  'hydrochlorothiazide': ['HCTZ', 'hydrochlor', 'water pill'],
  'acetaminophen': ['Tylenol', 'APAP', 'paracetamol'],
  'ibuprofen': ['Advil', 'Motrin', 'IBU'],
  'alprazolam': ['Xanax', 'xanex'],
  'levothyroxine': ['Synthroid', 'levo', 'thyroid med'],
  'metformin': ['Glucophage', 'met'],
  'omeprazole': ['Prilosec', 'ome'],
  'atorvastatin': ['Lipitor', 'ator'],
  'lisinopril': ['Zestril', 'Prinivil'],
  'sertraline': ['Zoloft'],
  'amlodipine': ['Norvasc'],
  'losartan': ['Cozaar'],
  'gabapentin': ['Neurontin', 'gaba'],
  'metoprolol': ['Lopressor', 'Toprol'],
  'simvastatin': ['Zocor'],
  'rosuvastatin': ['Crestor'],
  'pantoprazole': ['Protonix'],
  'escitalopram': ['Lexapro'],
  'duloxetine': ['Cymbalta'],
  'bupropion': ['Wellbutrin'],
  'fluoxetine': ['Prozac'],
  'trazodone': ['Desyrel', 'traz'],
  'citalopram': ['Celexa'],
  'venlafaxine': ['Effexor'],
  'paroxetine': ['Paxil'],
  'aripiprazole': ['Abilify'],
  'quetiapine': ['Seroquel'],
  'lamotrigine': ['Lamictal'],
  'pregabalin': ['Lyrica'],
  'montelukast': ['Singulair'],
  'furosemide': ['Lasix'],
  'warfarin': ['Coumadin'],
  'clopidogrel': ['Plavix'],
  'carvedilol': ['Coreg'],
  'tamsulosin': ['Flomax'],
  'finasteride': ['Proscar', 'Propecia'],
  'sildenafil': ['Viagra'],
  'tadalafil': ['Cialis'],
  'albuterol': ['ProAir', 'Ventolin', 'Proventil'],
  'prednisone': ['Deltasone', 'pred'],
  'azithromycin': ['Zithromax', 'Z-Pack', 'zpak'],
  'amoxicillin': ['Amoxil', 'amox'],
  'ciprofloxacin': ['Cipro'],
  'doxycycline': ['Vibramycin', 'doxy'],
  'naproxen': ['Aleve', 'Naprosyn'],
  'meloxicam': ['Mobic'],
  'tramadol': ['Ultram'],
  'cyclobenzaprine': ['Flexeril'],
  'lorazepam': ['Ativan'],
  'diazepam': ['Valium'],
  'zolpidem': ['Ambien'],
  'clonazepam': ['Klonopin'],
  'methylphenidate': ['Ritalin', 'Concerta'],
  'allopurinol': ['Zyloprim'],
  'colchicine': ['Colcrys'],
  'methotrexate': ['Trexall', 'MTX'],
  'fluconazole': ['Diflucan'],
  'valacyclovir': ['Valtrex'],
  'acyclovir': ['Zovirax'],
  'ondansetron': ['Zofran'],
  'lansoprazole': ['Prevacid'],
  'esomeprazole': ['Nexium'],
  'famotidine': ['Pepcid'],
  'semaglutide': ['Ozempic', 'Wegovy', 'Rybelsus'],
  'liraglutide': ['Victoza', 'Saxenda'],
  'empagliflozin': ['Jardiance'],
  'dapagliflozin': ['Farxiga'],
  'sitagliptin': ['Januvia'],
  'pioglitazone': ['Actos'],
  'apixaban': ['Eliquis'],
  'rivaroxaban': ['Xarelto'],
  'donepezil': ['Aricept'],
  'memantine': ['Namenda'],
  'latanoprost': ['Xalatan'],
  'alendronate': ['Fosamax'],
  'raloxifene': ['Evista'],
  'hydroxychloroquine': ['Plaquenil'],
  'topiramate': ['Topamax'],
  'levetiracetam': ['Keppra'],
  'baclofen': ['Lioresal'],
  'insulin glargine': ['Lantus', 'Basaglar', 'Toujeo'],
  'insulin lispro': ['Humalog', 'Admelog'],
  'insulin aspart': ['NovoLog', 'Fiasp'],
  'adalimumab': ['Humira'],
  'etanercept': ['Enbrel'],
};

const KNOWN_MISSPELLINGS = {
  'atorvastatin': ['atorvistatin', 'atorvastin', 'atorvastitin', 'atorvastain'],
  'metformin': ['metforman', 'metformen', 'metphormin', 'metaformin'],
  'lisinopril': ['lisinipril', 'lisinoprel', 'lysinopril', 'lisnapril'],
  'hydrochlorothiazide': ['hydrochlorathiazide', 'hydroclorothiazide', 'hydrochlorothiazid'],
  'amoxicillin': ['amoxicilin', 'amoxicillan', 'amoxacillin', 'amoxycillin'],
  'omeprazole': ['omeprazol', 'omeprazle', 'omaprazole'],
  'sertraline': ['sertralin', 'sertriline', 'sertraleen'],
  'levothyroxine': ['levothyroxin', 'levothyroxene', 'levthyroxine'],
  'amlodipine': ['amlodipene', 'amlodipin', 'amlodapine'],
  'losartan': ['losarten', 'losartain', 'losartin'],
  'gabapentin': ['gabapenten', 'gabapentine', 'gabapenitn'],
  'escitalopram': ['escitalipram', 'escitalopran', 'ecitalopram'],
  'simvastatin': ['simvastin', 'simvistatin', 'simvastain'],
  'rosuvastatin': ['rosuvastin', 'rosuvistatin', 'rosuvastain'],
  'pantoprazole': ['pantoprazol', 'pantaprazole', 'pantoprazle'],
  'duloxetine': ['duloxetin', 'duloxatine', 'duloxitine'],
  'bupropion': ['buproprion', 'bupropian', 'buproprion'],
  'venlafaxine': ['venlafaxin', 'venlaflaxine', 'venlefaxine'],
  'fluoxetine': ['fluoxetin', 'fluoxatine', 'fluoxetene'],
  'citalopram': ['citalopran', 'citalapram', 'citlopram'],
  'montelukast': ['montelukest', 'monteleucast', 'montelukass'],
  'azithromycin': ['azithromicin', 'azithromycen', 'azithromysin'],
  'ciprofloxacin': ['ciprofloxacen', 'ciprofloxicin', 'ciprafloxacin'],
  'furosemide': ['furosimide', 'frusemide', 'furosomide'],
  'tamsulosin': ['tamsulosen', 'tamsulocin', 'tamsulasin'],
  'semaglutide': ['semaglutid', 'semagltide', 'semaglutyde'],
  'empagliflozin': ['empaglaflozin', 'empagliflozn', 'empaglflozin'],
  'pregabalin': ['pregabalyn', 'pregablin', 'pregaballin'],
  'aripiprazole': ['aripiprazol', 'aripriprazole', 'aripiprazle'],
  'quetiapine': ['quetiapene', 'quetiapin', 'quetiepine'],
  'carvedilol': ['carvedilal', 'carvedolol', 'carvidelol'],
  'trazodone': ['trazadone', 'trazodon', 'trazidone'],
  'alprazolam': ['alprazolm', 'alprazalam', 'alprazolom'],
  'clonazepam': ['clonazapam', 'clonazpam', 'clomazepam'],
  'methylphenidate': ['methylphenadate', 'methylphenaidate', 'methlyphenidate'],
  'doxycycline': ['doxycyclin', 'doxicycline', 'doxycyline'],
  'cephalexin': ['cephalxin', 'cefalexin', 'cephlexin'],
  'metoprolol': ['metoprolal', 'metaprolol', 'metoprolo'],
  'propranolol': ['propranolal', 'propanolol', 'propranalol'],
  'spironolactone': ['spironolacton', 'spironalactone', 'spironolactne'],
  'warfarin': ['warferin', 'warfaren', 'warfrin'],
  'clopidogrel': ['clopidagrel', 'clopidogral', 'clopidorel'],
  'allopurinol': ['alopurinol', 'allopurinal', 'allopurinall'],
  'hydroxychloroquine': ['hydroxychloroquin', 'hydrochloroquine', 'hydroxychloroquene'],
  'lamotrigine': ['lamotrigin', 'lamotragine', 'lamitrigine'],
  'topiramate': ['topiramat', 'toporamate', 'topiramate'],
  'levetiracetam': ['levetiracetm', 'levetiractem', 'levetiracitam'],
};

// Drug class/use mapping for common drugs
const DRUG_CLASSES = {
  'lisinopril': ['ACE Inhibitor', 'Blood pressure'],
  'enalapril': ['ACE Inhibitor', 'Blood pressure'],
  'benazepril': ['ACE Inhibitor', 'Blood pressure'],
  'ramipril': ['ACE Inhibitor', 'Blood pressure'],
  'quinapril': ['ACE Inhibitor', 'Blood pressure'],
  'fosinopril': ['ACE Inhibitor', 'Blood pressure'],
  'atorvastatin': ['Statin', 'Cholesterol'],
  'simvastatin': ['Statin', 'Cholesterol'],
  'rosuvastatin': ['Statin', 'Cholesterol'],
  'pravastatin': ['Statin', 'Cholesterol'],
  'lovastatin': ['Statin', 'Cholesterol'],
  'fluvastatin': ['Statin', 'Cholesterol'],
  'pitavastatin': ['Statin', 'Cholesterol'],
  'metformin': ['Biguanide', 'Diabetes'],
  'glipizide': ['Sulfonylurea', 'Diabetes'],
  'glyburide': ['Sulfonylurea', 'Diabetes'],
  'glimepiride': ['Sulfonylurea', 'Diabetes'],
  'pioglitazone': ['Thiazolidinedione', 'Diabetes'],
  'sitagliptin': ['DPP-4 Inhibitor', 'Diabetes'],
  'empagliflozin': ['SGLT2 Inhibitor', 'Diabetes'],
  'dapagliflozin': ['SGLT2 Inhibitor', 'Diabetes'],
  'canagliflozin': ['SGLT2 Inhibitor', 'Diabetes'],
  'semaglutide': ['GLP-1 Agonist', 'Diabetes / Weight'],
  'liraglutide': ['GLP-1 Agonist', 'Diabetes / Weight'],
  'dulaglutide': ['GLP-1 Agonist', 'Diabetes'],
  'insulin glargine': ['Insulin (long-acting)', 'Diabetes'],
  'insulin lispro': ['Insulin (rapid-acting)', 'Diabetes'],
  'insulin aspart': ['Insulin (rapid-acting)', 'Diabetes'],
  'amlodipine': ['CCB', 'Blood pressure'],
  'nifedipine': ['CCB', 'Blood pressure'],
  'diltiazem': ['CCB', 'Blood pressure'],
  'verapamil': ['CCB', 'Blood pressure'],
  'losartan': ['ARB', 'Blood pressure'],
  'valsartan': ['ARB', 'Blood pressure'],
  'irbesartan': ['ARB', 'Blood pressure'],
  'olmesartan': ['ARB', 'Blood pressure'],
  'candesartan': ['ARB', 'Blood pressure'],
  'telmisartan': ['ARB', 'Blood pressure'],
  'metoprolol': ['Beta blocker', 'Blood pressure'],
  'atenolol': ['Beta blocker', 'Blood pressure'],
  'propranolol': ['Beta blocker', 'Blood pressure'],
  'carvedilol': ['Beta blocker', 'Heart failure'],
  'bisoprolol': ['Beta blocker', 'Blood pressure'],
  'sotalol': ['Beta blocker', 'Heart rhythm'],
  'hydrochlorothiazide': ['Thiazide diuretic', 'Blood pressure'],
  'chlorthalidone': ['Thiazide diuretic', 'Blood pressure'],
  'furosemide': ['Loop diuretic', 'Fluid retention'],
  'spironolactone': ['K-sparing diuretic', 'Blood pressure'],
  'sertraline': ['SSRI', 'Depression / Anxiety'],
  'fluoxetine': ['SSRI', 'Depression / Anxiety'],
  'citalopram': ['SSRI', 'Depression'],
  'escitalopram': ['SSRI', 'Depression / Anxiety'],
  'paroxetine': ['SSRI', 'Depression / Anxiety'],
  'fluvoxamine': ['SSRI', 'OCD / Anxiety'],
  'venlafaxine': ['SNRI', 'Depression / Anxiety'],
  'duloxetine': ['SNRI', 'Depression / Pain'],
  'bupropion': ['NDRI', 'Depression / Smoking'],
  'mirtazapine': ['Tetracyclic', 'Depression'],
  'trazodone': ['SARI', 'Depression / Insomnia'],
  'amitriptyline': ['TCA', 'Depression / Pain'],
  'nortriptyline': ['TCA', 'Depression / Pain'],
  'buspirone': ['Anxiolytic', 'Anxiety'],
  'hydroxyzine': ['Antihistamine', 'Anxiety / Allergy'],
  'alprazolam': ['Benzodiazepine', 'Anxiety'],
  'lorazepam': ['Benzodiazepine', 'Anxiety'],
  'diazepam': ['Benzodiazepine', 'Anxiety / Spasm'],
  'clonazepam': ['Benzodiazepine', 'Seizures / Anxiety'],
  'quetiapine': ['Atypical antipsychotic', 'Bipolar / Schizophrenia'],
  'aripiprazole': ['Atypical antipsychotic', 'Bipolar / Schizophrenia'],
  'risperidone': ['Atypical antipsychotic', 'Schizophrenia'],
  'olanzapine': ['Atypical antipsychotic', 'Bipolar / Schizophrenia'],
  'lamotrigine': ['Anticonvulsant', 'Bipolar / Seizures'],
  'topiramate': ['Anticonvulsant', 'Seizures / Migraine'],
  'levetiracetam': ['Anticonvulsant', 'Seizures'],
  'gabapentin': ['Anticonvulsant', 'Nerve pain / Seizures'],
  'pregabalin': ['Anticonvulsant', 'Nerve pain / Fibromyalgia'],
  'carbamazepine': ['Anticonvulsant', 'Seizures / Bipolar'],
  'phenytoin': ['Anticonvulsant', 'Seizures'],
  'omeprazole': ['PPI', 'Acid reflux'],
  'pantoprazole': ['PPI', 'Acid reflux'],
  'lansoprazole': ['PPI', 'Acid reflux'],
  'esomeprazole': ['PPI', 'Acid reflux'],
  'famotidine': ['H2 blocker', 'Acid reflux'],
  'levothyroxine': ['Thyroid hormone', 'Hypothyroid'],
  'methimazole': ['Antithyroid', 'Hyperthyroid'],
  'montelukast': ['Leukotriene inhibitor', 'Asthma / Allergies'],
  'albuterol': ['Beta-2 agonist', 'Asthma / COPD'],
  'tiotropium': ['Anticholinergic', 'COPD'],
  'fluticasone': ['Corticosteroid', 'Asthma / Allergies'],
  'budesonide': ['Corticosteroid', 'Asthma / IBD'],
  'warfarin': ['Anticoagulant', 'Blood clots'],
  'clopidogrel': ['Antiplatelet', 'Blood clots'],
  'apixaban': ['DOAC', 'Blood clots / AFib'],
  'rivaroxaban': ['DOAC', 'Blood clots / AFib'],
  'tamsulosin': ['Alpha blocker', 'Enlarged prostate'],
  'finasteride': ['5-alpha reductase', 'Enlarged prostate / Hair'],
  'dutasteride': ['5-alpha reductase', 'Enlarged prostate'],
  'sildenafil': ['PDE5 inhibitor', 'Erectile dysfunction'],
  'tadalafil': ['PDE5 inhibitor', 'Erectile dysfunction'],
  'donepezil': ['Cholinesterase inhibitor', 'Alzheimer\'s'],
  'memantine': ['NMDA antagonist', 'Alzheimer\'s'],
  'allopurinol': ['Xanthine oxidase inhibitor', 'Gout'],
  'colchicine': ['Anti-gout', 'Gout'],
  'prednisone': ['Corticosteroid', 'Inflammation'],
  'methylprednisolone': ['Corticosteroid', 'Inflammation'],
  'methotrexate': ['DMARD', 'Rheumatoid arthritis'],
  'hydroxychloroquine': ['DMARD', 'Lupus / RA'],
  'amoxicillin': ['Penicillin antibiotic', 'Infection'],
  'azithromycin': ['Macrolide antibiotic', 'Infection'],
  'ciprofloxacin': ['Fluoroquinolone', 'Infection'],
  'doxycycline': ['Tetracycline antibiotic', 'Infection'],
  'cephalexin': ['Cephalosporin', 'Infection'],
  'clindamycin': ['Lincosamide antibiotic', 'Infection'],
  'metronidazole': ['Nitroimidazole', 'Infection'],
  'fluconazole': ['Antifungal', 'Fungal infection'],
  'valacyclovir': ['Antiviral', 'Herpes / Shingles'],
  'acyclovir': ['Antiviral', 'Herpes / Shingles'],
  'ondansetron': ['5-HT3 antagonist', 'Nausea'],
  'meloxicam': ['NSAID', 'Pain / Inflammation'],
  'naproxen': ['NSAID', 'Pain / Inflammation'],
  'ibuprofen': ['NSAID', 'Pain / Inflammation'],
  'tramadol': ['Opioid analgesic', 'Pain'],
  'cyclobenzaprine': ['Muscle relaxant', 'Muscle spasm'],
  'baclofen': ['Muscle relaxant', 'Muscle spasm'],
  'tizanidine': ['Muscle relaxant', 'Muscle spasm'],
  'methocarbamol': ['Muscle relaxant', 'Muscle spasm'],
  'zolpidem': ['Sedative-hypnotic', 'Insomnia'],
  'cetirizine': ['Antihistamine', 'Allergies'],
  'loratadine': ['Antihistamine', 'Allergies'],
  'alendronate': ['Bisphosphonate', 'Osteoporosis'],
  'latanoprost': ['Prostaglandin analog', 'Glaucoma'],
  'timolol': ['Beta blocker (ophthalmic)', 'Glaucoma'],
  'estradiol': ['Estrogen', 'Menopause / HRT'],
  'norethindrone': ['Progestin', 'Contraception'],
  'adalimumab': ['TNF inhibitor', 'Autoimmune'],
  'etanercept': ['TNF inhibitor', 'Autoimmune'],
  'methylphenidate': ['Stimulant', 'ADHD'],
  'clonidine': ['Alpha-2 agonist', 'Blood pressure / ADHD'],
  'acetaminophen': ['Analgesic', 'Pain / Fever'],
  'aspirin': ['NSAID / Antiplatelet', 'Pain / Blood clots'],
};

// ============================================================
// STEP 4: Enrich with RxNorm API data
// ============================================================

async function enrichWithRxNorm(drugName) {
  try {
    // Get RxCUI via getDrugs (exact match first)
    const url = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(drugName)}`;
    const data = await fetchJSON(url);
    if (!data) return null;

    const groups = data?.drugGroup?.conceptGroup || [];
    let rxcui = null;
    let brandNames = [];

    // Look for IN (ingredient) or BN (brand name) entries
    for (const g of groups) {
      if (g.tty === 'IN' && g.conceptProperties) {
        rxcui = g.conceptProperties[0].rxcui;
      }
      if (g.tty === 'BN' && g.conceptProperties) {
        brandNames = g.conceptProperties.map(cp => cp.name);
      }
    }

    // If we got an RxCUI, get related brand names
    if (rxcui && brandNames.length === 0) {
      await sleep(RXNORM_DELAY);
      const bnData = await fetchJSON(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=BN`);
      if (bnData?.relatedGroup?.conceptGroup) {
        for (const g of bnData.relatedGroup.conceptGroup) {
          if (g.conceptProperties) {
            brandNames = g.conceptProperties.map(cp => cp.name);
          }
        }
      }
    }

    return { rxcui, brandNames: brandNames.slice(0, 8) };
  } catch (err) {
    return null;
  }
}

// ============================================================
// STEP 5: Enrich with openFDA data
// ============================================================

async function enrichWithOpenFDA(drugName) {
  try {
    const url = `https://api.fda.gov/drug/ndc.json?search=generic_name:"${encodeURIComponent(drugName)}"&limit=5`;
    const data = await fetchJSON(url);
    if (!data?.results) return null;

    const brands = new Set();
    const forms = new Set();
    for (const r of data.results) {
      if (r.brand_name) brands.add(r.brand_name);
      if (r.dosage_form) forms.add(r.dosage_form);
    }

    return {
      brandNames: [...brands].slice(0, 5),
      dosageForms: [...forms],
    };
  } catch (err) {
    return null;
  }
}

// ============================================================
// MAIN BUILD
// ============================================================

async function buildDictionary() {
  console.log('=== RxGator Drug Dictionary Builder ===\n');

  // Load existing data
  const dictionary = loadExistingData();

  // Deduplicate TOP_DRUGS
  const uniqueDrugs = [...new Set(TOP_DRUGS.map(d => d.toLowerCase()))];
  console.log(`[BUILD] Processing ${uniqueDrugs.length} unique drug names...\n`);

  let rxnormHits = 0;
  let fdaHits = 0;
  let processed = 0;

  for (const drugName of uniqueDrugs) {
    processed++;
    if (processed % 25 === 0) {
      console.log(`  ... ${processed}/${uniqueDrugs.length} processed (${rxnormHits} RxNorm, ${fdaHits} FDA hits)`);
    }

    // Initialize entry if not exists
    if (!dictionary[drugName]) {
      dictionary[drugName] = {
        generic: drugName,
        brands: [],
        drugClass: '',
        primaryUse: '',
        hasGeneric: true,
        typicalSavings: '',
        aliases: [],
        commonMisspellings: [],
      };
    }

    const entry = dictionary[drugName];

    // Add known aliases
    if (KNOWN_ALIASES[drugName]) {
      for (const alias of KNOWN_ALIASES[drugName]) {
        if (!entry.aliases.includes(alias) && !entry.brands.includes(alias)) {
          entry.aliases.push(alias);
        }
      }
    }

    // Add known misspellings
    if (KNOWN_MISSPELLINGS[drugName]) {
      for (const ms of KNOWN_MISSPELLINGS[drugName]) {
        if (!entry.commonMisspellings.includes(ms)) {
          entry.commonMisspellings.push(ms);
        }
      }
    }

    // Add drug class info
    if (DRUG_CLASSES[drugName] && (!entry.drugClass || !entry.primaryUse)) {
      entry.drugClass = entry.drugClass || DRUG_CLASSES[drugName][0];
      entry.primaryUse = entry.primaryUse || DRUG_CLASSES[drugName][1];
    }

    // Enrich from RxNorm (with rate limiting)
    const rxData = await enrichWithRxNorm(drugName);
    if (rxData) {
      rxnormHits++;
      if (rxData.rxcui) entry.id = rxData.rxcui;
      for (const bn of (rxData.brandNames || [])) {
        if (!entry.brands.includes(bn)) {
          entry.brands.push(bn);
        }
      }
    }
    await sleep(RXNORM_DELAY);

    // Enrich from openFDA (with rate limiting) — only for first 100 to stay within limits
    if (processed <= 100) {
      const fdaData = await enrichWithOpenFDA(drugName);
      if (fdaData) {
        fdaHits++;
        for (const bn of (fdaData.brandNames || [])) {
          if (!entry.brands.includes(bn)) {
            entry.brands.push(bn);
          }
        }
      }
      await sleep(OPENFDA_DELAY);
    }

    // Mark brand-only drugs (no generic available)
    const noGenericDrugs = [
      'semaglutide', 'liraglutide', 'dulaglutide', 'empagliflozin',
      'dapagliflozin', 'canagliflozin', 'sitagliptin', 'apixaban',
      'rivaroxaban', 'adalimumab', 'etanercept', 'insulin glargine',
      'insulin lispro', 'insulin aspart', 'tiotropium', 'pregabalin',
      'aripiprazole', 'suvorexant', 'mirabegron', 'ticagrelor',
    ];
    if (noGenericDrugs.includes(drugName)) {
      entry.hasGeneric = false;
      entry.typicalSavings = 'N/A — brand only';
    } else if (!entry.typicalSavings) {
      entry.typicalSavings = '80-95%';
    }
  }

  console.log(`\n[BUILD] API enrichment complete: ${rxnormHits} RxNorm hits, ${fdaHits} openFDA hits`);

  // ============================================================
  // STEP 6: Build output files
  // ============================================================

  // drug-names.json — client-side Fuse.js dictionary
  const drugNames = Object.values(dictionary).map(entry => ({
    id: entry.id || null,
    generic: entry.generic,
    brands: entry.brands.slice(0, 8),
    aliases: entry.aliases,
    drugClass: entry.drugClass,
    primaryUse: entry.primaryUse,
    hasGeneric: entry.hasGeneric,
    commonMisspellings: entry.commonMisspellings,
  }));

  // Sort alphabetically by generic name
  drugNames.sort((a, b) => a.generic.localeCompare(b.generic));

  // Write drug-names.json to public/ for client-side access
  const drugNamesPath = path.join(__dirname, 'public', 'drug-names.json');
  fs.writeFileSync(drugNamesPath, JSON.stringify(drugNames, null, 2));
  console.log(`[OUTPUT] drug-names.json: ${drugNames.length} entries → ${drugNamesPath}`);
  console.log(`         File size: ${(fs.statSync(drugNamesPath).size / 1024).toFixed(1)} KB`);

  // Update brand-generic-lookup.json — add any new brand→generic mappings
  let lookup = {};
  try {
    lookup = JSON.parse(fs.readFileSync(path.join(__dirname, 'brand-generic-lookup.json'), 'utf8'));
  } catch (e) {}

  let newMappings = 0;
  for (const entry of drugNames) {
    for (const brand of entry.brands) {
      const key = brand.toLowerCase();
      if (!lookup[key]) {
        lookup[key] = {
          brand: brand,
          generic: entry.generic,
          drugClass: entry.drugClass,
          primaryUse: entry.primaryUse,
          hasGeneric: entry.hasGeneric,
          typicalSavings: entry.typicalSavings || '80-95%',
        };
        newMappings++;
      }
    }
    // Also add aliases as lookup keys
    for (const alias of entry.aliases) {
      const key = alias.toLowerCase();
      if (!lookup[key]) {
        lookup[key] = {
          brand: alias,
          generic: entry.generic,
          drugClass: entry.drugClass,
          primaryUse: entry.primaryUse,
          hasGeneric: entry.hasGeneric,
          typicalSavings: entry.typicalSavings || '80-95%',
        };
        newMappings++;
      }
    }
  }

  const lookupPath = path.join(__dirname, 'brand-generic-lookup.json');
  fs.writeFileSync(lookupPath, JSON.stringify(lookup, null, 2));
  console.log(`[OUTPUT] brand-generic-lookup.json: ${Object.keys(lookup).length} entries (${newMappings} new)`);

  console.log('\n=== Dictionary build complete ===');
  console.log(`Total drugs: ${drugNames.length}`);
  console.log(`With brand names: ${drugNames.filter(d => d.brands.length > 0).length}`);
  console.log(`With aliases: ${drugNames.filter(d => d.aliases.length > 0).length}`);
  console.log(`With misspellings: ${drugNames.filter(d => d.commonMisspellings.length > 0).length}`);
  console.log(`With drug class: ${drugNames.filter(d => d.drugClass).length}`);
  console.log(`Brand-only (no generic): ${drugNames.filter(d => !d.hasGeneric).length}`);
}

buildDictionary().catch(err => {
  console.error('BUILD FAILED:', err);
  process.exit(1);
});
