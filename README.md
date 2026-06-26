RXGator
Prescription Aggregator — One search. Every platform. The real lowest price.

rxgator.info



RXGator is a free, independent prescription drug price comparison tool that searches multiple data sources simultaneously to find the lowest available price for any medication in the United States.

Unlike GoodRx or SingleCare, which only show their own negotiated prices, RXGator compares across all of them — plus pharmacy programs, government benchmarks, and mail-order options — to show you the actual lowest price available.
The Problem
No single discount card is cheapest for every drug at every pharmacy. The same generic medication can cost $4 at Walmart and $37 at CVS — same pill, same day, same zip code. The winning strategy today is to manually check 2–3 platforms per prescription, which nobody has time to do.

RXGator eliminates that friction.
Data Sources
RXGator currently queries 8 data sources in a single search:

Source
Type
What It Provides
Cost Plus Drugs
Live API
2,200+ generics with transparent cost-plus pricing (Mark Cuban's pharmacy)
SingleCare
Cached (Apify)
4,700+ drugs with pharmacy-specific pricing at CVS, Walgreens, Walmart, Kroger, Costco
NADAC (Medicaid)
Live API
National Average Drug Acquisition Cost — what pharmacies actually pay (government benchmark)
RxNorm (NLM)
Live API
Drug normalization, brand-to-generic resolution, fuzzy matching
MedlinePlus (NLM)
Live API
Consumer-friendly drug information from the National Library of Medicine
openFDA
Live API
Drug safety data, NDC codes, dosage forms
Walmart Rx Program
Built-in
85 drugs across $4/$9/$15 pricing tiers
Costco Pharmacy
Estimated
Retail pricing estimates (no membership required to use Costco pharmacy)


Five of these sources are free government APIs that will never cost anything. SingleCare integration uses web scraping infrastructure that requires ongoing funding.
Features
Brand-to-generic resolution — Search "Lipitor" and RXGator automatically resolves it to atorvastatin and shows generic prices with a clear explanation
Pharmacy-specific pricing — See what each pharmacy charges, including loyalty program pricing
NADAC benchmark — Every search shows what pharmacies actually pay for the drug, so you can judge whether any price is fair
MedlinePlus drug information — Plain-language description of what the drug does, pulled from the National Library of Medicine
"How do I get this price?" — Step-by-step instructions for each source (how to use Cost Plus, how to ask for the Walmart $4 price, etc.)
Price type tags — Every result labeled as Mail-Order, In-Store, Discount Card, or Benchmark so you know what to expect
Zip code support — Infrastructure ready for location-specific pricing as more platforms are integrated
WCAG 2.1 AA compliant — Accessible to all users
Search analytics and feedback collection — Understanding what users need to guide development
Tech Stack
Backend: Node.js / Express
Data: Cost Plus Drugs API, Medicaid NADAC API, RxNorm API, MedlinePlus API, openFDA API, SingleCare (Apify cached)
Hosting: IONOS VPS (Ubuntu 24.04), PM2, Nginx, Let's Encrypt SSL
Frontend: Vanilla HTML/CSS/JS (no framework dependencies)
Roadmap
Planned Integrations
Blink Health (price-match guarantee on generics)
RxSaver (60,000 pharmacies, advocacy savings program)
NeedyMeds (patient assistance programs, manufacturer copay cards)
Medicare Part D spending data (CMS)
Price history charts
Insurance copay comparison
Mobile app
Completed
Cost Plus Drugs (live API)
NADAC 2025 benchmark (Medicaid open data)
openFDA drug normalization
RxNorm brand-to-generic resolution
MedlinePlus drug information
Walmart Rx Program (85 drugs, 3 tiers)
Costco Pharmacy estimates
SingleCare (Apify cached)
WCAG 2.1 AA compliance
Search logging and analytics
User feedback collection
Zip code field
Support RXGator
RXGator is free to use and always will be. The government data sources are free. The server is paid for. But integrating commercial discount card platforms requires web scraping infrastructure that costs $29–$150/month per platform.

Every dollar goes directly to data acquisition. There are no salaries, no offices, no overhead.

Open Collective: opencollective.com/rxgator (pending approval)
Patreon: patreon.com/rxgator (coming soon)
What Your Support Funds
Amount
Impact
$10/month
Covers one-third of SingleCare scraping
$29/month
Covers one full platform integration
$150/month
Covers all current data sources
$300/month
Adds every viable discount platform
$500/month
Funds a mobile app for pharmacy-counter price checks

License
This project is a public-benefit tool built to serve consumer health transparency.
Contact
Matt Overeem — Founder

Website: rxgator.info
Email: matt@tapthemap.online
Organization: Technology Assessment Project LLC



RXGator is not medical advice. Always consult your doctor or pharmacist before making changes to your medications.
eration built to serve the public interest.

Transparency
All expenses are visible on this Open Collective page. You can see exactly how every dollar is spent — which platforms we’re paying for, how much each costs, and when. We believe in the same transparency for our funding that we believe in for drug pricing.

