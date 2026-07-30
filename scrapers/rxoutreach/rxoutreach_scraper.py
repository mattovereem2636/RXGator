#!/usr/bin/env python3
"""
RxOutreach Formulary Scraper & Price Parser
For RxGator integration (Source #13)

Scrapes the Rx Outreach medication list from rxoutreach.org/find-your-medication/
and normalizes pricing into structured JSON and CSV for RxGator's aggregation engine.

Usage:
    python rxoutreach_scraper.py

Outputs:
    rxoutreach_formulary.json   - Full structured data
    rxoutreach_formulary.csv    - Flat CSV for spreadsheet/DB import
    rxoutreach_scrape_log.txt   - Scrape metadata and parsing stats
"""

import requests
from bs4 import BeautifulSoup
import re
import json
import csv
import sys
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional


# ─── Data Models ───────────────────────────────────────────────────────────────

@dataclass
class PriceTier:
    """A single price point extracted from RxOutreach's free-text pricing."""
    price: float
    quantity: Optional[int] = None
    days_supply: Optional[int] = None
    unit: Optional[str] = None          # 'tablet', 'capsule', 'tube', 'inhaler', etc.
    is_additional: bool = False          # True if this is an "each additional" tier
    is_free: bool = False
    note: Optional[str] = None          # Partnership info, limits, etc.


@dataclass
class Medication:
    """A single medication entry from the RxOutreach formulary."""
    name: str
    strength: str
    brand_equivalents: list
    condition: str
    form: str                           # Extracted: Tablet, Capsule, Cream, etc.
    is_controlled: bool = False         # (CS) flag
    is_otc: bool = False                # (OTC) flag
    
    # Raw price strings from the two columns
    days_supply_raw: str = ""
    quantity_raw: str = ""
    
    # Parsed & normalized prices
    price_tiers: list = field(default_factory=list)
    
    # Normalized for RxGator comparison (primary outputs)
    price_30day: Optional[float] = None
    price_90day: Optional[float] = None
    price_per_unit: Optional[float] = None  # Where calculable
    
    # Source metadata
    source: str = "Rx Outreach"
    source_url: str = "https://rxoutreach.org/find-your-medication/"
    source_type: str = "nonprofit_mail_order"
    includes_shipping: bool = True


# ─── Price Parser ──────────────────────────────────────────────────────────────

class PriceParser:
    """
    Parses RxOutreach's free-text pricing into structured tiers.
    
    Known patterns:
      Days Supply column:
        "$10 for 30 days    $15 for 90 days"
        "$20 (limit 12) for 90 days"
        
      Quantity column:
        "$12 for up to 30 tablets    $7 for up to each additional 30 tablets"
        "$20 per tube"
        "$40 per inhaler"
        "$15 for up to 75 vials"
        "$25 for up to 3 packs of 28 tablets"
        "$0 for up to 90 days    Supported through a partnership for a limited time"
        "One Free Monitor Annually (no prescription required)"
        "$35 for up to 14 films    $56 for up to 30 films    $25 for each additional 30 films ..."
        "$22 per bottle (Minimum of 2 bottles, 120 sprays each)"
    """
    
    # Regex patterns for price extraction
    DAYS_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s*(?:\(.*?\))?\s*for\s+(\d+)\s*days?',
        re.IGNORECASE
    )
    
    # Common unit words including known typos in source data
    _UNIT_STR = r'(tablets?|capsules?|capusles?|films?|vials?|packs?|patches?|kits?|pens?|syringes?|sprays?)'
    
    QTY_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+for\s+(?:up\s+to\s+)?(\d+)\s+' + _UNIT_STR,
        re.IGNORECASE
    )
    
    QTY_ADDITIONAL_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+for\s+(?:up\s+to\s+)?each\s+additional\s+(\d+)\s+' + _UNIT_STR,
        re.IGNORECASE
    )
    
    PER_UNIT_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+(?:per|for\s+(?:1|one|each))\s+'
        r'(tube|inhaler|bottle|pump|box|nasal\s*spray|dropper|canister|vial|can|pack|kit|syringe|pen)',
        re.IGNORECASE
    )
    
    # "per N vials/units" pattern
    PER_N_UNITS_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+per\s+(\d+)\s+'
        r'(tubes?|vials?|bottles?|packs?|capsules?|tablets?|kits?|pens?|syringes?)',
        re.IGNORECASE
    )
    
    # "$X per pack of N" pattern
    PER_PACK_OF_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+per\s+pack\s+of\s+(\d+)',
        re.IGNORECASE
    )
    
    BOTTLE_PATTERN = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+for\s+(?:a\s+)?bottle\s+of\s+(\d+)',
        re.IGNORECASE
    )
    
    FREE_PATTERN = re.compile(
        r'\$0\s+for|One\s+Free|free',
        re.IGNORECASE
    )
    
    MULTI_TIER_QTY = re.compile(
        r'\$(\d+(?:\.\d{2})?)\s+for\s+up\s+to\s+(\d+)\s+(tablets?|capsules?|films?|vials?)',
        re.IGNORECASE
    )
    
    def parse(self, days_supply_raw: str, quantity_raw: str) -> list:
        """Parse both price columns and return list of PriceTier objects."""
        tiers = []
        
        # Normalize concatenated text: insert space before $ signs
        days_supply_raw = re.sub(r'(?<!\s)\$', ' $', days_supply_raw)
        quantity_raw = re.sub(r'(?<!\s)\$', ' $', quantity_raw)
        
        # Parse days supply column
        if days_supply_raw.strip():
            tiers.extend(self._parse_days_supply(days_supply_raw))
        
        # Parse quantity column
        if quantity_raw.strip():
            tiers.extend(self._parse_quantity(quantity_raw))
        
        return tiers
    
    def _parse_days_supply(self, text: str) -> list:
        """Parse entries like '$10 for 30 days    $15 for 90 days'."""
        tiers = []
        for match in self.DAYS_PATTERN.finditer(text):
            price = float(match.group(1))
            days = int(match.group(2))
            tiers.append(PriceTier(
                price=price,
                days_supply=days,
                is_free=(price == 0)
            ))
        return tiers
    
    def _parse_quantity(self, text: str) -> list:
        """Parse the quantity pricing column (more complex patterns)."""
        tiers = []
        
        # Check for free/partnership items
        if self.FREE_PATTERN.search(text):
            # Try to extract days if present
            days_match = re.search(r'(\d+)\s*days?', text)
            note_match = re.search(r'(Supported through.*|partnership.*|limited time.*)', text, re.IGNORECASE)
            tiers.append(PriceTier(
                price=0.0,
                days_supply=int(days_match.group(1)) if days_match else None,
                is_free=True,
                note=note_match.group(1).strip() if note_match else "Free program"
            ))
            # If it's purely free, return early; otherwise continue parsing other tiers
            if '$0' in text and not re.search(r'\$[1-9]', text):
                return tiers
        
        # Parse "per unit" prices ($40 per inhaler)
        for match in self.PER_UNIT_PATTERN.finditer(text):
            price = float(match.group(1))
            unit = match.group(2).strip().lower()
            note = None
            # Check for parenthetical notes
            paren_match = re.search(r'\(([^)]+)\)', text)
            if paren_match:
                note = paren_match.group(1)
            tiers.append(PriceTier(
                price=price,
                quantity=1,
                unit=unit,
                note=note
            ))
        
        # Parse "bottle of N" prices
        for match in self.BOTTLE_PATTERN.finditer(text):
            price = float(match.group(1))
            qty = int(match.group(2))
            tiers.append(PriceTier(
                price=price,
                quantity=qty,
                unit='bottle'
            ))
        
        # Parse "each additional" tiers first (so we can mark them)
        for match in self.QTY_ADDITIONAL_PATTERN.finditer(text):
            price = float(match.group(1))
            qty = int(match.group(2))
            unit = match.group(3).strip().lower()
            tiers.append(PriceTier(
                price=price,
                quantity=qty,
                unit=unit,
                is_additional=True
            ))
        
        # Parse standard quantity tiers (excluding "additional" matches)
        # Remove "additional" portions from text to avoid double-matching
        cleaned = self.QTY_ADDITIONAL_PATTERN.sub('', text)
        for match in self.QTY_PATTERN.finditer(cleaned):
            price = float(match.group(1))
            qty = int(match.group(2))
            unit = match.group(3).strip().lower()
            tiers.append(PriceTier(
                price=price,
                quantity=qty,
                unit=unit,
                is_additional=False
            ))
        
        # Parse "per N units" pattern ($70 per 60 vials)
        for match in self.PER_N_UNITS_PATTERN.finditer(text):
            price = float(match.group(1))
            qty = int(match.group(2))
            unit = match.group(3).strip().lower()
            tiers.append(PriceTier(
                price=price,
                quantity=qty,
                unit=unit
            ))
        
        # Parse "per pack of N" pattern ($45 per pack of 1)
        for match in self.PER_PACK_OF_PATTERN.finditer(text):
            price = float(match.group(1))
            qty = int(match.group(2))
            tiers.append(PriceTier(
                price=price,
                quantity=qty,
                unit='pack'
            ))
        
        # Deduplicate (per-unit can overlap with qty patterns)
        seen = set()
        deduped = []
        for t in tiers:
            key = (t.price, t.quantity, t.is_additional, t.unit)
            if key not in seen:
                seen.add(key)
                deduped.append(t)
        
        return deduped
    
    def normalize_30_90(self, tiers: list) -> tuple:
        """
        From parsed tiers, derive a normalized 30-day and 90-day price.
        Returns (price_30day, price_90day) — either may be None.
        """
        ORAL_UNITS = (
            'tablet', 'tablets', 'capsule', 'capsules',
            'film', 'films', 'vial', 'vials'
        )
        
        price_30 = None
        price_90 = None
        
        # Direct days-supply matches take priority
        for t in tiers:
            if t.days_supply == 30:
                price_30 = t.price
            elif t.days_supply == 90:
                price_90 = t.price
        
        # If no days_supply but we have quantity tiers for ~30 units (typical monthly)
        if price_30 is None:
            for t in tiers:
                if not t.is_additional and not t.is_free and t.quantity:
                    if t.quantity == 30 and t.unit in ORAL_UNITS:
                        price_30 = t.price
                        break
        
        # 60-unit tier → approximate as 2-month; derive 30-day as half
        if price_30 is None:
            for t in tiers:
                if not t.is_additional and not t.is_free and t.quantity:
                    if t.quantity == 60 and t.unit in ORAL_UNITS:
                        price_30 = round(t.price / 2, 2)
                        break
        
        # Estimate 90-day from 30-unit base + additional tiers
        if price_90 is None and price_30 is not None:
            additional = [t for t in tiers if t.is_additional and t.quantity == 30]
            if additional:
                price_90 = price_30 + (2 * additional[0].price)
        
        # For quantity tiers of 90 units
        if price_90 is None:
            for t in tiers:
                if not t.is_additional and not t.is_free and t.quantity:
                    if t.quantity == 90 and t.unit in ORAL_UNITS:
                        price_90 = t.price
                        break
        
        # Birth control packs: 3 packs = ~90-day supply
        if price_30 is None and price_90 is None:
            for t in tiers:
                if not t.is_additional and t.unit in ('pack', 'packs'):
                    if t.quantity == 3:
                        price_90 = t.price
                        price_30 = round(t.price / 3, 2)
                    elif t.quantity == 1:
                        price_30 = t.price
                    break
        
        # For per-unit items (inhalers, tubes, pumps), use unit price as 30-day
        if price_30 is None and price_90 is None:
            for t in tiers:
                if not t.is_additional and t.unit in (
                    'inhaler', 'tube', 'pump', 'bottle', 'nasal spray',
                    'dropper', 'box', 'canister', 'vial'
                ):
                    price_30 = t.price
                    break
        
        # Catch-all: if we have any non-additional tier with a quantity
        # and still no price, use the lowest-quantity tier as approximate 30-day
        if price_30 is None and price_90 is None:
            non_add = sorted(
                [t for t in tiers if not t.is_additional and not t.is_free and t.price > 0],
                key=lambda t: t.quantity or 9999
            )
            if non_add:
                t = non_add[0]
                if t.quantity and t.quantity <= 30:
                    price_30 = t.price
                elif t.quantity and t.quantity <= 100:
                    price_30 = round(t.price * 30 / t.quantity, 2)
                else:
                    price_30 = t.price  # Best we can do
        
        # Free items
        if any(t.is_free for t in tiers):
            if price_30 is None:
                price_30 = 0.0
            if price_90 is None:
                price_90 = 0.0
        
        return price_30, price_90


# ─── Medication Name Parser ───────────────────────────────────────────────────

def parse_medication_name(raw_name: str) -> dict:
    """
    Extract drug form, controlled substance flag, and OTC flag from name.
    
    Examples:
        "Alprazolam Tablet (CS)" -> form=Tablet, is_controlled=True
        "Acetaminophen Extra Strength Tablet (OTC)" -> form=Tablet, is_otc=True
        "Acyclovir Ointment 30g Tube" -> form=Ointment
        "Albuterol Sulfate HFA Inhaler" -> form=Inhaler
    """
    is_controlled = '(CS)' in raw_name
    is_otc = '(OTC)' in raw_name
    
    # Clean flags from name for form extraction
    clean = raw_name.replace('(CS)', '').replace('(OTC)', '').strip()
    
    # Extract dosage form
    forms = [
        'Tablet', 'Capsule', 'Cream', 'Ointment', 'Gel', 'Lotion',
        'Inhaler', 'Inhalation Solution', 'Inhalation Suspension',
        'Nasal Spray', 'Eye Drops', 'Solution', 'Suspension',
        'Film', 'Patch', 'Injection', 'Suppository', 'Spray',
        'Powder', 'Liquid', 'Syrup', 'Drops', 'Pack', 'Pump',
        'Monitor', 'Strips', 'Elixir'
    ]
    
    detected_form = "Other"
    for form in forms:
        if form.lower() in clean.lower():
            detected_form = form
            break
    
    # Clean the display name
    display_name = raw_name.replace('(CS)', '').replace('(OTC)', '').strip()
    # Remove trailing size info like "30g Tube", "45G Tube", "5mL", etc.
    display_name = re.sub(r'\s+\d+[gG]\s*(?:Tube)?', '', display_name)
    display_name = re.sub(r'\s+\d+m[lL]\s*', '', display_name)
    display_name = display_name.strip()
    
    return {
        'clean_name': display_name,
        'form': detected_form,
        'is_controlled': is_controlled,
        'is_otc': is_otc
    }


# ─── Scraper ──────────────────────────────────────────────────────────────────

def scrape_rxoutreach() -> list:
    """Fetch and parse the full RxOutreach formulary page."""
    
    url = "https://rxoutreach.org/find-your-medication/"
    headers = {
        'User-Agent': 'RxGator Price Aggregator (rxgator.info) - nonprofit research tool'
    }
    
    print(f"Fetching {url}...")
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    print(f"  Response: {resp.status_code}, {len(resp.text):,} bytes")
    
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    # Find the medication table — look for table with medication headers
    tables = soup.find_all('table')
    med_table = None
    
    for table in tables:
        headers_row = table.find('tr')
        if headers_row:
            header_text = headers_row.get_text().lower()
            if 'medication' in header_text and 'strength' in header_text:
                med_table = table
                break
    
    if not med_table:
        # Try finding by id or class
        med_table = soup.find('table', id=re.compile(r'rxo|med', re.I))
        if not med_table:
            # Fallback: largest table on page
            med_table = max(tables, key=lambda t: len(t.find_all('tr'))) if tables else None
    
    if not med_table:
        print("ERROR: Could not find medication table on page")
        sys.exit(1)
    
    rows = med_table.find_all('tr')
    print(f"  Found {len(rows)} table rows")
    
    # Skip header row
    parser = PriceParser()
    medications = []
    parse_errors = []
    
    for i, row in enumerate(rows[1:], start=1):
        cells = row.find_all(['td', 'th'])
        if len(cells) < 6:
            continue
        
        try:
            raw_name = cells[0].get_text(strip=True)
            strength = cells[1].get_text(strip=True)
            brand_raw = cells[2].get_text(strip=True)
            days_supply_raw = cells[3].get_text(strip=True)
            quantity_raw = cells[4].get_text(strip=True)
            condition = cells[5].get_text(strip=True)
            
            if not raw_name or raw_name.lower() == 'medication':
                continue
            
            # Parse medication name
            name_info = parse_medication_name(raw_name)
            
            # Parse brand equivalents
            brands = [b.strip() for b in re.split(r'[/®]+', brand_raw) if b.strip()]
            # Clean up: remove empty strings and lone special chars
            brands = [b.replace('®', '').strip() for b in brands if len(b.strip()) > 1]
            
            # Parse prices
            price_tiers = parser.parse(days_supply_raw, quantity_raw)
            price_30, price_90 = parser.normalize_30_90(price_tiers)
            
            # Calculate per-unit price where possible
            price_per_unit = None
            if price_30 is not None and price_30 > 0:
                # Assume 30 units for 30-day supply of oral meds
                if name_info['form'] in ('Tablet', 'Capsule'):
                    price_per_unit = round(price_30 / 30, 4)
            
            med = Medication(
                name=name_info['clean_name'],
                strength=strength,
                brand_equivalents=brands,
                condition=condition,
                form=name_info['form'],
                is_controlled=name_info['is_controlled'],
                is_otc=name_info['is_otc'],
                days_supply_raw=days_supply_raw,
                quantity_raw=quantity_raw,
                price_tiers=[asdict(t) for t in price_tiers],
                price_30day=price_30,
                price_90day=price_90,
                price_per_unit=price_per_unit
            )
            
            medications.append(med)
            
        except Exception as e:
            parse_errors.append({
                'row': i,
                'error': str(e),
                'raw_text': row.get_text(strip=True)[:200]
            })
    
    print(f"\n  Parsed: {len(medications)} medications")
    print(f"  Parse errors: {len(parse_errors)}")
    
    return medications, parse_errors


# ─── Output Writers ───────────────────────────────────────────────────────────

def write_json(medications: list, filepath: str):
    """Write full structured data as JSON."""
    output = {
        'source': 'Rx Outreach',
        'source_url': 'https://rxoutreach.org/find-your-medication/',
        'source_type': 'nonprofit_mail_order',
        'scrape_date': datetime.now().isoformat(),
        'total_medications': len(medications),
        'notes': [
            'Rx Outreach is a nonprofit mail-order pharmacy',
            'All prices include free standard shipping to all 50 states',
            'No insurance, membership, or eligibility requirements',
            'Controlled substances (CS) require special shipping',
            'Some medications are free through partnership programs'
        ],
        'medications': [asdict(m) for m in medications]
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"  JSON: {filepath} ({len(medications)} records)")


def write_csv(medications: list, filepath: str):
    """Write flat CSV for spreadsheet or database import."""
    fieldnames = [
        'name', 'strength', 'form', 'brand_equivalents',
        'condition', 'is_controlled', 'is_otc',
        'price_30day', 'price_90day', 'price_per_unit',
        'days_supply_raw', 'quantity_raw',
        'source', 'source_type', 'includes_shipping'
    ]
    
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        
        for med in medications:
            writer.writerow({
                'name': med.name,
                'strength': med.strength,
                'form': med.form,
                'brand_equivalents': ' | '.join(med.brand_equivalents),
                'condition': med.condition,
                'is_controlled': med.is_controlled,
                'is_otc': med.is_otc,
                'price_30day': med.price_30day if med.price_30day is not None else '',
                'price_90day': med.price_90day if med.price_90day is not None else '',
                'price_per_unit': med.price_per_unit if med.price_per_unit is not None else '',
                'days_supply_raw': med.days_supply_raw,
                'quantity_raw': med.quantity_raw,
                'source': med.source,
                'source_type': med.source_type,
                'includes_shipping': med.includes_shipping
            })
    
    print(f"  CSV:  {filepath} ({len(medications)} records)")


def write_log(medications: list, errors: list, filepath: str):
    """Write scrape metadata and statistics."""
    
    # Compute stats
    total = len(medications)
    has_30 = sum(1 for m in medications if m.price_30day is not None)
    has_90 = sum(1 for m in medications if m.price_90day is not None)
    free = sum(1 for m in medications if m.price_30day == 0.0)
    controlled = sum(1 for m in medications if m.is_controlled)
    otc = sum(1 for m in medications if m.is_otc)
    
    # Condition breakdown
    conditions = {}
    for m in medications:
        for cond in m.condition.split('/'):
            cond = cond.strip()
            if cond:
                conditions[cond] = conditions.get(cond, 0) + 1
    
    # Form breakdown
    forms = {}
    for m in medications:
        forms[m.form] = forms.get(m.form, 0) + 1
    
    # Price ranges (excluding free)
    prices_30 = [m.price_30day for m in medications 
                 if m.price_30day is not None and m.price_30day > 0]
    prices_90 = [m.price_90day for m in medications 
                 if m.price_90day is not None and m.price_90day > 0]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write("=" * 70 + "\n")
        f.write("RxOutreach Formulary Scrape — Log & Statistics\n")
        f.write(f"Scrape Date: {datetime.now().strftime('%B %d, %Y at %I:%M %p')}\n")
        f.write("=" * 70 + "\n\n")
        
        f.write("SUMMARY\n")
        f.write("-" * 40 + "\n")
        f.write(f"Total medications scraped:   {total}\n")
        f.write(f"With 30-day price:           {has_30} ({has_30/total*100:.1f}%)\n")
        f.write(f"With 90-day price:           {has_90} ({has_90/total*100:.1f}%)\n")
        f.write(f"Free (partnership):          {free}\n")
        f.write(f"Controlled substances (CS):  {controlled}\n")
        f.write(f"Over-the-counter (OTC):      {otc}\n")
        f.write(f"Parse errors:                {len(errors)}\n\n")
        
        if prices_30:
            f.write("30-DAY PRICE RANGE\n")
            f.write("-" * 40 + "\n")
            f.write(f"Min:     ${min(prices_30):.2f}\n")
            f.write(f"Max:     ${max(prices_30):.2f}\n")
            f.write(f"Median:  ${sorted(prices_30)[len(prices_30)//2]:.2f}\n")
            f.write(f"Mean:    ${sum(prices_30)/len(prices_30):.2f}\n\n")
        
        if prices_90:
            f.write("90-DAY PRICE RANGE\n")
            f.write("-" * 40 + "\n")
            f.write(f"Min:     ${min(prices_90):.2f}\n")
            f.write(f"Max:     ${max(prices_90):.2f}\n")
            f.write(f"Median:  ${sorted(prices_90)[len(prices_90)//2]:.2f}\n")
            f.write(f"Mean:    ${sum(prices_90)/len(prices_90):.2f}\n\n")
        
        f.write("DOSAGE FORMS\n")
        f.write("-" * 40 + "\n")
        for form, count in sorted(forms.items(), key=lambda x: -x[1]):
            f.write(f"  {form:<30s} {count:>5d}\n")
        f.write("\n")
        
        f.write("TOP CONDITIONS (by medication count)\n")
        f.write("-" * 40 + "\n")
        for cond, count in sorted(conditions.items(), key=lambda x: -x[1])[:25]:
            f.write(f"  {cond:<40s} {count:>5d}\n")
        f.write("\n")
        
        if errors:
            f.write("PARSE ERRORS\n")
            f.write("-" * 40 + "\n")
            for err in errors:
                f.write(f"  Row {err['row']}: {err['error']}\n")
                f.write(f"    Text: {err['raw_text'][:120]}...\n\n")
        
        f.write("=" * 70 + "\n")
        f.write("End of log\n")
    
    print(f"  Log:  {filepath}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("RxOutreach Formulary Scraper for RxGator")
    print(f"Run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60 + "\n")
    
    # Scrape
    medications, errors = scrape_rxoutreach()
    
    # Output
    output_dir = "/home/claude"
    print(f"\nWriting output files...")
    
    write_json(medications, f"{output_dir}/rxoutreach_formulary.json")
    write_csv(medications, f"{output_dir}/rxoutreach_formulary.csv")
    write_log(medications, errors, f"{output_dir}/rxoutreach_scrape_log.txt")
    
    # Quick preview
    print(f"\n{'─' * 60}")
    print("SAMPLE OUTPUT (first 10 medications):")
    print(f"{'─' * 60}")
    for med in medications[:10]:
        p30 = f"${med.price_30day:.2f}" if med.price_30day is not None else "N/A"
        p90 = f"${med.price_90day:.2f}" if med.price_90day is not None else "N/A"
        print(f"  {med.name} {med.strength}")
        print(f"    30-day: {p30}  |  90-day: {p90}  |  {med.condition}")
    
    print(f"\n{'=' * 60}")
    print("Scrape complete.")
    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
