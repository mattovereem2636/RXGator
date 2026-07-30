/**
 * RxGator Drug Name Dictionary Builder
 * Pulls from RxNorm API + curated data to build the fuzzy search dictionary
 * Run once, then maintain monthly
 */

const https = require('https');

// Helper to fetch JSON from an API
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// Top 200 most prescribed generics in the US (source: ClinCalc / Medicare Part D)
// Each entry: [generic, [brands], drugClass, primaryUse, commonMisspellings, aliases]
const DRUG_DATA = [
  ["atorvastatin", ["Lipitor","Atorvaliq"], "Statin", "Cholesterol", ["atorvistatin","atorvastin","atorvastain","atorvststin","atorvasatin","atorvstatin"], ["ator"]],
  ["metformin", ["Glucophage","Fortamet","Glumetza","Riomet"], "Biguanide", "Diabetes", ["metforman","metformon","metfromin","metfomin","metformen","metphormin"], ["met","glucophage"]],
  ["lisinopril", ["Zestril","Prinivil"], "ACE Inhibitor", "Blood pressure", ["lisinipril","lisonopril","lisiniprol","lisinoprel","lisinopral","lisanopril","lysinopril"], ["lisin"]],
  ["amlodipine", ["Norvasc"], "CCB", "Blood pressure", ["amlodapine","amlopidine","amlodipene","amlidopine","amlodepine","amoldipine"], ["amlod","norvasc"]],
  ["levothyroxine", ["Synthroid","Levoxyl","Tirosint","Unithroid"], "Thyroid hormone", "Thyroid", ["levothyroxin","levothyroxene","levothyroxyne","levothroxine","levothyroxinee","synthroid"], ["levo","synthroid","thyroid med"]],
  ["omeprazole", ["Prilosec"], "PPI", "Acid reflux", ["omeprazol","omeprozole","omeprasole","omeprezole","omeprazolr","omeparzole"], ["ome","prilosec"]],
  ["losartan", ["Cozaar"], "ARB", "Blood pressure", ["losarten","loserton","lorsartan","losatan","losartaan","losartin"], ["losar","cozaar"]],
  ["gabapentin", ["Neurontin","Gralise"], "Anticonvulsant", "Nerve pain", ["gabapenton","gabapentine","gabapantin","gabapenten","gabbapentin","gabapentim"], ["gaba","neurontin"]],
  ["sertraline", ["Zoloft"], "SSRI", "Depression / Anxiety", ["sertralin","sertralline","sertriline","sertaline","sertriline","sertraleen"], ["sert","zoloft"]],
  ["montelukast", ["Singulair"], "LTRA", "Asthma / Allergies", ["montelucast","monteleukast","montelukest","montelucast","montelukats"], ["monte","singulair"]],
  ["escitalopram", ["Lexapro"], "SSRI", "Depression / Anxiety", ["escitlopram","escitalopran","escitalipram","escitaopram","escitolopram"], ["escit","lexapro"]],
  ["trazodone", ["Desyrel","Oleptro"], "SARI", "Depression / Sleep", ["trazadone","trasodone","trazodne","trasadone","trazadome"], ["traz"]],
  ["pantoprazole", ["Protonix"], "PPI", "Acid reflux", ["pantoprazol","pantaprazole","pantoprasole","pantoprezole","pantroprazole"], ["panto","protonix"]],
  ["rosuvastatin", ["Crestor"], "Statin", "Cholesterol", ["rosuvastain","rosuvistatin","rosuvastaten","rosuvastin","rosuvstatin"], ["rosu","crestor"]],
  ["duloxetine", ["Cymbalta"], "SNRI", "Depression / Pain", ["duloxatine","duloxetin","duloxitine","duloxotine","dulocetine"], ["dulox","cymbalta"]],
  ["bupropion", ["Wellbutrin","Zyban"], "NDRI", "Depression / Smoking", ["buproprion","bupropian","buproprion","bupropoin","buproion"], ["bup","wellbutrin"]],
  ["meloxicam", ["Mobic"], "NSAID", "Pain / Inflammation", ["meloxicm","meloxican","meloxicame","meloxicab","melocicam"], ["melox","mobic"]],
  ["carvedilol", ["Coreg"], "Beta blocker", "Heart failure", ["carvediol","carvedolol","carvedalol","carvedlol","carvadilol"], ["carv","coreg"]],
  ["tamsulosin", ["Flomax"], "Alpha blocker", "Enlarged prostate", ["tamsulocin","tamsulosen","tamsulisin","tamsulosine","tamsolusin"], ["tams","flomax"]],
  ["hydrochlorothiazide", ["Microzide"], "Thiazide diuretic", "Blood pressure", ["hydrochlorothiazid","hydrochlorthiazide","hydrochlorothizide","hydrochorthiazide","hydroclorothiazide"], ["HCTZ","hydrochlor","water pill","microzide"]],
  ["fluoxetine", ["Prozac","Sarafem"], "SSRI", "Depression / Anxiety", ["fluoxatine","fluoxetin","fluoxitine","fluoxotine","fluoxetene"], ["fluox","prozac"]],
  ["amoxicillin", ["Amoxil","Trimox"], "Penicillin", "Bacterial infection", ["amoxicillan","amoxicilin","amoxycillin","amoxacillin","amoxicillion"], ["amox","amoxil"]],
  ["azithromycin", ["Zithromax","Z-Pack"], "Macrolide", "Bacterial infection", ["azithromicin","azithromycine","azythromycin","azitromycin","azithromysin"], ["azith","z-pack","zithromax","zpak","z pack"]],
  ["albuterol", ["ProAir","Ventolin","Proventil"], "Beta-2 agonist", "Asthma / COPD", ["albuteral","albuterol","albuterel","albutarol","albuteroll"], ["alb","proair","ventolin","inhaler"]],
  ["prednisone", ["Deltasone","Rayos"], "Corticosteroid", "Inflammation", ["predizone","predisone","prednezone","predinosone","prednizone","prednisoine"], ["pred"]],
  ["clopidogrel", ["Plavix"], "Antiplatelet", "Blood clots", ["clopidogral","clopidogel","clopidogril","clopidogrell","clopidogrel"], ["clop","plavix"]],
  ["furosemide", ["Lasix"], "Loop diuretic", "Edema / Heart failure", ["furosimide","furosimede","furosemid","furosimide","furosimede"], ["furo","lasix"]],
  ["metoprolol", ["Lopressor","Toprol-XL"], "Beta blocker", "Blood pressure / Heart", ["metoprolal","metoprololol","metopralol","metoprolo","metprolol"], ["meto","lopressor","toprol"]],
  ["glipizide", ["Glucotrol"], "Sulfonylurea", "Diabetes", ["glipizid","glipazide","glipzide","glipeside","glipiside"], ["glip","glucotrol"]],
  ["pravastatin", ["Pravachol"], "Statin", "Cholesterol", ["pravastain","pravastein","pravistatin","pravastaten","pravastation"], ["prav","pravachol"]],
  ["simvastatin", ["Zocor"], "Statin", "Cholesterol", ["simvistatin","simvastin","simvastain","simvastatine","simvastaten"], ["simv","zocor"]],
  ["warfarin", ["Coumadin","Jantoven"], "Anticoagulant", "Blood clots", ["warferin","warfrin","warfarin","warfaren","warfain"], ["warf","coumadin"]],
  ["citalopram", ["Celexa"], "SSRI", "Depression", ["citalopran","citalpram","citalapram","citaloprame","citaloprm"], ["cital","celexa"]],
  ["tramadol", ["Ultram","ConZip"], "Opioid analgesic", "Pain", ["tramadal","tramadoll","tramodol","tramadole","tramadl"], ["tram","ultram"]],
  ["metronidazole", ["Flagyl"], "Antibiotic", "Bacterial / Parasitic infection", ["metronidazol","metronidizole","metronidazle","metronidazol","metranidazole"], ["metro","flagyl"]],
  ["cyclobenzaprine", ["Flexeril","Amrix"], "Muscle relaxant", "Muscle spasm", ["cyclobenzaprin","cyclobenzapreen","cyclobenzaprine","cyclobenzapene","cyclobenziprine"], ["cyclo","flexeril"]],
  ["doxycycline", ["Vibramycin","Doryx"], "Tetracycline", "Bacterial infection", ["doxycyclin","doxicycline","doxycycline","doxicicline","doxycyclene"], ["doxy","vibramycin"]],
  ["venlafaxine", ["Effexor"], "SNRI", "Depression / Anxiety", ["venlafaxin","venlafexine","venlafaxene","vanlafaxine","venlafxine"], ["venla","effexor"]],
  ["clonazepam", ["Klonopin"], "Benzodiazepine", "Seizures / Anxiety", ["clonazepan","clonazipam","clonazapam","clonazepem","clonezepam"], ["clona","klonopin"]],
  ["alprazolam", ["Xanax"], "Benzodiazepine", "Anxiety", ["alprazolan","alprozolam","alprazolm","alprazolame","alprazolom"], ["xanax","xanex","alpraz"]],
  ["methylphenidate", ["Ritalin","Concerta","Focalin"], "Stimulant", "ADHD", ["methylphenidat","methylfenidate","methlyphenidate","methylphenidiate","methylphenadate"], ["ritalin","concerta"]],
  ["diazepam", ["Valium"], "Benzodiazepine", "Anxiety / Seizures", ["diazepan","diazipam","diazapam","diazepem","diazapem"], ["valium"]],
  ["lorazepam", ["Ativan"], "Benzodiazepine", "Anxiety", ["lorazepan","lorazipam","lorazapam","lorazepem","lorezepam"], ["ativan","loraz"]],
  ["spironolactone", ["Aldactone"], "Potassium-sparing diuretic", "Heart failure / Edema", ["spironolacton","spiranolactone","spironolactone","spironalactone","sprionolactone"], ["spiro","aldactone"]],
  ["acetaminophen", ["Tylenol"], "Analgesic", "Pain / Fever", ["acetominophen","acetaminophin","acetiminophen","acetaminifen","acetaminophan"], ["tylenol","APAP","paracetamol"]],
  ["ibuprofen", ["Advil","Motrin"], "NSAID", "Pain / Inflammation", ["ibuprofin","ibuprophen","ibuprofene","ibeprofen","ibuprufen"], ["advil","motrin","IBU"]],
  ["naproxen", ["Aleve","Naprosyn"], "NSAID", "Pain / Inflammation", ["naproxin","naproxan","naproxyn","naporxen","naproxem"], ["aleve","naprosyn"]],
  ["cetirizine", ["Zyrtec"], "Antihistamine", "Allergies", ["cetrizine","ceterizine","cetirazine","cetirizin","cetirisine"], ["zyrtec"]],
  ["loratadine", ["Claritin"], "Antihistamine", "Allergies", ["loratidine","loratadin","loratidin","loratadene","loratidene"], ["claritin"]],
  ["fexofenadine", ["Allegra"], "Antihistamine", "Allergies", ["fexofenadene","fexofenidine","fexofenadince","fexafenadine"], ["allegra"]],
  ["famotidine", ["Pepcid"], "H2 blocker", "Acid reflux", ["famotadine","famotidene","famotodine","famoitdine"], ["pepcid"]],
  ["ranitidine", ["Zantac"], "H2 blocker", "Acid reflux", ["ranitadine","ranitidene","ranatidine","ranitadene"], ["zantac"]],
  ["lansoprazole", ["Prevacid"], "PPI", "Acid reflux", ["lansoprasole","lansaprazole","lansoprazol","lansoprazle"], ["prevacid"]],
  ["esomeprazole", ["Nexium"], "PPI", "Acid reflux", ["esomeprazol","esomeprasole","esomaprazole","esomeprezole"], ["nexium"]],
  ["insulin glargine", ["Lantus","Basaglar","Toujeo"], "Insulin", "Diabetes", ["insulin glargin","insulin glargene","insuline glargine"], ["lantus","basaglar"]],
  ["insulin lispro", ["Humalog","Admelog"], "Insulin", "Diabetes", ["insulin lispro","insulin lyspro","insuline lispro"], ["humalog"]],
  ["methotrexate", ["Trexall","Rasuvo","Otrexup"], "DMARD", "Rheumatoid arthritis / Cancer", ["methotrexat","methotrexete","methotrexatte","methotraxate"], ["MTX","trexall"]],
  ["prednisone", ["Deltasone","Rayos"], "Corticosteroid", "Inflammation", ["predizone","predisone","prednezone","predinosone"], ["pred"]],
  ["prednisolone", ["Orapred","Prelone"], "Corticosteroid", "Inflammation", ["prednisalone","prednisolne","prednisoline","prednisolon"], ["orapred"]],
  ["ciprofloxacin", ["Cipro"], "Fluoroquinolone", "Bacterial infection", ["ciprofloxicin","ciprofloxacine","ciprfloxacin","ciprofloxasin"], ["cipro"]],
  ["levofloxacin", ["Levaquin"], "Fluoroquinolone", "Bacterial infection", ["levofloxicin","levofloxacine","levofloxasin","levofloxcin"], ["levaquin"]],
  ["cephalexin", ["Keflex"], "Cephalosporin", "Bacterial infection", ["cephalexan","cephilexin","cephalixin","cephlexin","cephalexine"], ["keflex"]],
  ["clindamycin", ["Cleocin"], "Lincosamide", "Bacterial infection", ["clindamicin","clindamycine","clindamacin","clindamysin"], ["cleocin"]],
  ["sulfamethoxazole-trimethoprim", ["Bactrim","Septra"], "Sulfonamide", "Bacterial infection", ["sulfamethoxazole","bactrim","sulfa-trimethoprim"], ["bactrim","septra","SMZ-TMP","sulfa"]],
  ["benazepril", ["Lotensin"], "ACE Inhibitor", "Blood pressure", ["benazapril","benazepral","benazipril","benazeprile"], ["lotensin"]],
  ["enalapril", ["Vasotec"], "ACE Inhibitor", "Blood pressure", ["enalipril","enalopril","enalapral","enalipral"], ["vasotec"]],
  ["ramipril", ["Altace"], "ACE Inhibitor", "Blood pressure", ["ramapril","ramipral","rampril","ramiprile"], ["altace"]],
  ["valsartan", ["Diovan"], "ARB", "Blood pressure", ["valsarten","valsartin","valsarton","valsartane"], ["diovan"]],
  ["irbesartan", ["Avapro"], "ARB", "Blood pressure", ["irbesarten","irbesartin","irbesarton","irbasartan"], ["avapro"]],
  ["olmesartan", ["Benicar"], "ARB", "Blood pressure", ["olmesarten","olmesartin","olmasartan","olmisartan"], ["benicar"]],
  ["diltiazem", ["Cardizem","Tiazac"], "CCB", "Blood pressure / Heart", ["diltiazam","diltizem","diltiazm","diltiazen"], ["cardizem","tiazac"]],
  ["nifedipine", ["Procardia","Adalat"], "CCB", "Blood pressure", ["nifedapine","nifedipene","nifedepine","nifidipine"], ["procardia"]],
  ["atenolol", ["Tenormin"], "Beta blocker", "Blood pressure", ["atenalol","atenlol","atenolal","atanolol"], ["tenormin"]],
  ["propranolol", ["Inderal"], "Beta blocker", "Blood pressure / Anxiety", ["propranolal","propranalol","propronolol","propranololl"], ["inderal"]],
  ["bisoprolol", ["Zebeta"], "Beta blocker", "Blood pressure", ["bisoprolal","bisopralol","bisoprololl","bisoprolo"], ["zebeta"]],
  ["clonidine", ["Catapres"], "Alpha-2 agonist", "Blood pressure / ADHD", ["clonadine","clonidene","clonidin","clonodine"], ["catapres"]],
  ["finasteride", ["Proscar","Propecia"], "5-alpha reductase inhibitor", "BPH / Hair loss", ["finasterid","finastride","finasteride","fenasteride"], ["proscar","propecia"]],
  ["sildenafil", ["Viagra","Revatio"], "PDE5 inhibitor", "Erectile dysfunction / PAH", ["sildenafal","sildinafil","sildanafil","sildenifil"], ["viagra","revatio"]],
  ["tadalafil", ["Cialis","Adcirca"], "PDE5 inhibitor", "Erectile dysfunction / BPH", ["tadalafal","tadalifil","tadalfil","tadanafil"], ["cialis","adcirca"]],
  ["sumatriptan", ["Imitrex"], "Triptan", "Migraine", ["sumatriptin","sumatripten","sumatripan","sumatrippton"], ["imitrex"]],
  ["ondansetron", ["Zofran"], "5-HT3 antagonist", "Nausea / Vomiting", ["ondansetran","ondansetrin","ondancetrion","ondansteron"], ["zofran","ODT"]],
  ["promethazine", ["Phenergan"], "Antihistamine / Antiemetic", "Nausea / Allergies", ["promethazin","promethezine","promethazene","promethizine"], ["phenergan"]],
  ["meclizine", ["Antivert","Bonine"], "Antihistamine", "Vertigo / Motion sickness", ["meclazine","meclizene","meclezine","meclisine"], ["antivert","bonine"]],
  ["diclofenac", ["Voltaren"], "NSAID", "Pain / Inflammation", ["diclofenec","diclofanac","diclofinac","diclophenac"], ["voltaren"]],
  ["celecoxib", ["Celebrex"], "COX-2 inhibitor", "Pain / Inflammation", ["celecoxab","celcoxib","celecoxibe","celicoxib"], ["celebrex"]],
  ["pregabalin", ["Lyrica"], "Anticonvulsant", "Nerve pain / Fibromyalgia", ["pregabaline","pregabalon","pregablin","pregabakin"], ["lyrica"]],
  ["topiramate", ["Topamax"], "Anticonvulsant", "Seizures / Migraine", ["topiramat","topiromate","topiramite","topiramete"], ["topamax"]],
  ["lamotrigine", ["Lamictal"], "Anticonvulsant", "Seizures / Bipolar", ["lamotrigin","lamotragine","lamotrigene","lamitrigine"], ["lamictal"]],
  ["levetiracetam", ["Keppra"], "Anticonvulsant", "Seizures", ["levetiracetm","levetiracitam","levetiracetame","levetericetam"], ["keppra"]],
  ["valproic acid", ["Depakote","Depakene"], "Anticonvulsant", "Seizures / Bipolar", ["valproic","valporic acid","valprioc acid","valporic"], ["depakote","depakene","VPA"]],
  ["phenytoin", ["Dilantin"], "Anticonvulsant", "Seizures", ["phenytoine","phenytion","phenitoin","phenytoan"], ["dilantin"]],
  ["aripiprazole", ["Abilify"], "Atypical antipsychotic", "Bipolar / Schizophrenia", ["aripiprazol","aripiprasole","aripiprazle","aripaprazole"], ["abilify"]],
  ["quetiapine", ["Seroquel"], "Atypical antipsychotic", "Bipolar / Schizophrenia", ["quetiapene","quetipine","quetiapiene","quetiapaine"], ["seroquel"]],
  ["olanzapine", ["Zyprexa"], "Atypical antipsychotic", "Bipolar / Schizophrenia", ["olanzapene","olanzipine","olanzapiene","olanzepine"], ["zyprexa"]],
  ["risperidone", ["Risperdal"], "Atypical antipsychotic", "Schizophrenia / Bipolar", ["risperidome","risperadone","risperidon","risperdone"], ["risperdal"]],
  ["lithium carbonate", ["Lithobid","Eskalith"], "Mood stabilizer", "Bipolar", ["lithium carbonat","litheum","lithiam carbonate"], ["lithobid","lithium"]],
  ["buspirone", ["Buspar"], "Anxiolytic", "Anxiety", ["buspiron","busprirone","busprone","busparone"], ["buspar"]],
  ["hydroxyzine", ["Vistaril","Atarax"], "Antihistamine", "Anxiety / Allergies", ["hydroxyzene","hydroxizine","hydroxyzin","hyrdoxyzine"], ["vistaril","atarax"]],
  ["zolpidem", ["Ambien"], "Sedative-hypnotic", "Insomnia", ["zolpidam","zolpidm","zolpidem","zolpidim"], ["ambien"]],
  ["eszopiclone", ["Lunesta"], "Sedative-hypnotic", "Insomnia", ["eszopiclne","eszopiclone","eszopiclon","eszopiclome"], ["lunesta"]],
  ["donepezil", ["Aricept"], "Cholinesterase inhibitor", "Alzheimer's", ["donepazil","donepezal","donepizil","donepesil"], ["aricept"]],
  ["memantine", ["Namenda"], "NMDA antagonist", "Alzheimer's", ["mamantine","memantene","memantina","memantene"], ["namenda"]],
  ["montelukast", ["Singulair"], "LTRA", "Asthma / Allergies", ["montelukest","montelucust","montleukast","montelucast"], ["singulair"]],
  ["fluticasone", ["Flonase","Flovent"], "Corticosteroid", "Allergies / Asthma", ["fluticasone","fluticason","fluticasne","fluitcasone"], ["flonase","flovent"]],
  ["budesonide", ["Pulmicort","Rhinocort","Entocort"], "Corticosteroid", "Asthma / Allergies / Crohn's", ["budesonid","budesonide","budisonide","budesanide"], ["pulmicort","rhinocort"]],
  ["tiotropium", ["Spiriva"], "Anticholinergic", "COPD", ["tiotropiam","tiotripium","tiotropeum","tiotropiom"], ["spiriva"]],
  ["latanoprost", ["Xalatan"], "Prostaglandin analog", "Glaucoma", ["latanopros","latanprost","latanaprost","latanoproste"], ["xalatan"]],
  ["timolol", ["Timoptic"], "Beta blocker (ophthalmic)", "Glaucoma", ["timlol","timolal","timolole","timool"], ["timoptic"]],
  ["pioglitazone", ["Actos"], "Thiazolidinedione", "Diabetes", ["pioglitazon","pioglitasone","pioglitezone","pioglitazone"], ["actos"]],
  ["sitagliptin", ["Januvia"], "DPP-4 inhibitor", "Diabetes", ["sitaglipten","sitagliptan","sitaglipton","stagliptin"], ["januvia"]],
  ["empagliflozin", ["Jardiance"], "SGLT2 inhibitor", "Diabetes / Heart failure", ["empagliflozn","empaglifozin","empagliflozine","empaglaflozin"], ["jardiance"]],
  ["dapagliflozin", ["Farxiga"], "SGLT2 inhibitor", "Diabetes / Heart failure", ["dapagliflozn","dapaglifozin","dapagliflozine","dapaglioflzin"], ["farxiga"]],
  ["liraglutide", ["Victoza","Saxenda"], "GLP-1 agonist", "Diabetes / Weight loss", ["liraglutid","liraglutide","liraglutyde","liragluetide"], ["victoza","saxenda"]],
  ["semaglutide", ["Ozempic","Wegovy","Rybelsus"], "GLP-1 agonist", "Diabetes / Weight loss", ["semaglutid","semaglutide","semaglutyde","semglutide","semiglutide"], ["ozempic","wegovy","rybelsus"]],
  ["tirzepatide", ["Mounjaro","Zepbound"], "GIP/GLP-1 agonist", "Diabetes / Weight loss", ["tirzepatid","tirzepatyde","tirazepatide","tirzepatede"], ["mounjaro","zepbound"]],
  ["apixaban", ["Eliquis"], "Factor Xa inhibitor", "Blood clots / AFib", ["apixiban","apixabin","apixaban","apixiben"], ["eliquis"]],
  ["rivaroxaban", ["Xarelto"], "Factor Xa inhibitor", "Blood clots / AFib", ["rivaroxiban","rivaroxabin","rivaroxban","riivaroxaban"], ["xarelto"]],
  ["dabigatran", ["Pradaxa"], "Direct thrombin inhibitor", "Blood clots / AFib", ["dabigitran","dabigatren","dabiagatran","dabigatrin"], ["pradaxa"]],
  ["allopurinol", ["Zyloprim"], "XO inhibitor", "Gout", ["allopurinol","allopurinall","alopurinol","allopurinole"], ["zyloprim"]],
  ["colchicine", ["Colcrys","Mitigare"], "Anti-gout", "Gout", ["colchicin","colchicene","colchisine","colchiciene"], ["colcrys"]],
  ["febuxostat", ["Uloric"], "XO inhibitor", "Gout", ["febuxostate","febuxostat","febuoxstat","febuxstat"], ["uloric"]],
  ["metoclopramide", ["Reglan"], "Prokinetic", "Nausea / GERD", ["metocloprimide","metocloprimade","metoclopramid","metaclopramide"], ["reglan"]],
  ["dicyclomine", ["Bentyl"], "Anticholinergic", "IBS", ["dicyclomin","dicyclomene","dicyclamine","dycyclomine"], ["bentyl"]],
  ["sucralfate", ["Carafate"], "Mucosal protectant", "Ulcers", ["sucralfat","sucralfete","sucralpate","sucralfete"], ["carafate"]],
  ["nitrofurantoin", ["Macrobid","Macrodantin"], "Antibiotic", "UTI", ["nitrofurantione","nitrofurantion","nitrofurantoen","nitrofuranoin"], ["macrobid"]],
  ["phenazopyridine", ["Pyridium","Azo"], "Urinary analgesic", "UTI pain", ["phenazopyridin","phenazopyradine","phenazopyridene"], ["pyridium","azo"]],
  ["oxybutynin", ["Ditropan"], "Anticholinergic", "Overactive bladder", ["oxybutynine","oxybutinin","oxybuynin","oxybutynon"], ["ditropan"]],
  ["solifenacin", ["Vesicare"], "Anticholinergic", "Overactive bladder", ["solifenacine","solifenican","solifencin","solifenacen"], ["vesicare"]],
  ["testosterone", ["AndroGel","Testim","Axiron"], "Androgen", "Low testosterone", ["testosteron","testosterome","testostrone","testostirone"], ["androgel","testim","T"]],
  ["estradiol", ["Estrace","Vivelle-Dot","Climara"], "Estrogen", "Menopause / HRT", ["estradial","estradol","estridiol","estradioal"], ["estrace"]],
  ["medroxyprogesterone", ["Provera","Depo-Provera"], "Progestin", "Menopause / Contraception", ["medroxyprogesterone","medroxyprogesterion","medroxiprogesterone"], ["provera","depo-provera"]],
  ["norethindrone", ["Aygestin","Camila"], "Progestin", "Contraception", ["norethindron","norethendrone","norethindrone","norethindrne"], ["aygestin"]],
];

// Build the dictionary
function buildDictionary() {
  const dictionary = DRUG_DATA.map((entry, index) => {
    const [generic, brands, drugClass, primaryUse, misspellings, aliases] = entry;
    return {
      id: String(1000 + index),
      generic: generic,
      brands: brands,
      aliases: aliases || [],
      drugClass: drugClass,
      primaryUse: primaryUse,
      primaryUseES: translateUse(primaryUse),
      hasGeneric: true,
      commonMisspellings: misspellings || [],
    };
  });

  // Remove duplicates (some drugs appear twice in the data)
  const seen = new Set();
  const deduped = dictionary.filter(d => {
    if (seen.has(d.generic)) return false;
    seen.add(d.generic);
    return true;
  });

  return deduped;
}

// Spanish translations for primary uses
function translateUse(use) {
  const translations = {
    "Cholesterol": "Colesterol",
    "Diabetes": "Diabetes",
    "Blood pressure": "Presión arterial",
    "Thyroid": "Tiroides",
    "Acid reflux": "Reflujo ácido",
    "Nerve pain": "Dolor nervioso",
    "Depression / Anxiety": "Depresión / Ansiedad",
    "Asthma / Allergies": "Asma / Alergias",
    "Depression / Sleep": "Depresión / Sueño",
    "Depression / Pain": "Depresión / Dolor",
    "Depression / Smoking": "Depresión / Dejar de fumar",
    "Pain / Inflammation": "Dolor / Inflamación",
    "Heart failure": "Insuficiencia cardíaca",
    "Enlarged prostate": "Próstata agrandada",
    "Blood pressure / Heart": "Presión arterial / Corazón",
    "Depression": "Depresión",
    "Pain": "Dolor",
    "Bacterial infection": "Infección bacteriana",
    "Bacterial / Parasitic infection": "Infección bacteriana / parasitaria",
    "Muscle spasm": "Espasmo muscular",
    "Depression / Anxiety": "Depresión / Ansiedad",
    "Seizures / Anxiety": "Convulsiones / Ansiedad",
    "Anxiety": "Ansiedad",
    "ADHD": "TDAH",
    "Anxiety / Seizures": "Ansiedad / Convulsiones",
    "Heart failure / Edema": "Insuficiencia cardíaca / Edema",
    "Pain / Fever": "Dolor / Fiebre",
    "Allergies": "Alergias",
    "Vertigo / Motion sickness": "Vértigo / Mareo",
    "Nausea / Vomiting": "Náuseas / Vómitos",
    "Nausea / Allergies": "Náuseas / Alergias",
    "Migraine": "Migraña",
    "Blood clots": "Coágulos de sangre",
    "Blood clots / AFib": "Coágulos / Fibrilación auricular",
    "Edema / Heart failure": "Edema / Insuficiencia cardíaca",
    "Inflammation": "Inflamación",
    "BPH / Hair loss": "HPB / Caída del cabello",
    "Erectile dysfunction / PAH": "Disfunción eréctil",
    "Erectile dysfunction / BPH": "Disfunción eréctil / HPB",
    "Seizures / Bipolar": "Convulsiones / Trastorno bipolar",
    "Seizures": "Convulsiones",
    "Seizures / Migraine": "Convulsiones / Migraña",
    "Bipolar / Schizophrenia": "Bipolar / Esquizofrenia",
    "Schizophrenia / Bipolar": "Esquizofrenia / Bipolar",
    "Bipolar": "Trastorno bipolar",
    "Insomnia": "Insomnio",
    "Alzheimer's": "Alzheimer",
    "Asthma / COPD": "Asma / EPOC",
    "Asthma / Allergies / Crohn's": "Asma / Alergias / Crohn",
    "COPD": "EPOC",
    "Glaucoma": "Glaucoma",
    "Gout": "Gota",
    "Nausea / GERD": "Náuseas / ERGE",
    "IBS": "SII",
    "Ulcers": "Úlceras",
    "UTI": "Infección urinaria",
    "UTI pain": "Dolor de infección urinaria",
    "Overactive bladder": "Vejiga hiperactiva",
    "Low testosterone": "Testosterona baja",
    "Menopause / HRT": "Menopausia / TRH",
    "Menopause / Contraception": "Menopausia / Anticoncepción",
    "Contraception": "Anticoncepción",
    "Nerve pain / Fibromyalgia": "Dolor nervioso / Fibromialgia",
    "Diabetes / Weight loss": "Diabetes / Pérdida de peso",
    "Diabetes / Heart failure": "Diabetes / Insuficiencia cardíaca",
    "Rheumatoid arthritis / Cancer": "Artritis reumatoide / Cáncer",
    "Cancer": "Cáncer",
  };
  return translations[use] || use;
}

// Build and write
const dictionary = buildDictionary();
const fs = require('fs');

// Write the full dictionary
fs.writeFileSync(
  '/home/claude/rxgator-search-upgrade/data/drug-names.json',
  JSON.stringify(dictionary, null, 2)
);

// Build the brand-to-generic quick-lookup map
const brandMap = {};
dictionary.forEach(drug => {
  drug.brands.forEach(brand => {
    brandMap[brand.toLowerCase()] = {
      generic: drug.generic,
      drugClass: drug.drugClass,
      primaryUse: drug.primaryUse,
      primaryUseES: drug.primaryUseES,
    };
  });
  // Also add aliases that are brand names
  drug.aliases.forEach(alias => {
    if (!brandMap[alias.toLowerCase()]) {
      brandMap[alias.toLowerCase()] = {
        generic: drug.generic,
        drugClass: drug.drugClass,
        primaryUse: drug.primaryUse,
        primaryUseES: drug.primaryUseES,
      };
    }
  });
});

fs.writeFileSync(
  '/home/claude/rxgator-search-upgrade/data/brand-generic-map.json',
  JSON.stringify(brandMap, null, 2)
);

console.log(`Dictionary built: ${dictionary.length} drugs`);
console.log(`Brand map built: ${Object.keys(brandMap).length} brand/alias entries`);
console.log(`Sample entry:`, JSON.stringify(dictionary[0], null, 2));
