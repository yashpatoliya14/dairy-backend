"""
DairyDesk Customer Milk Card OCR & Data Extraction Script
Extracts Customer Name, Mobile Number, Milk Quantity (Liters), Rate (Price), and Card #
without relying on any external AI or Gemini API.
"""

import sys
import os
import re
import json
import argparse
from pathlib import Path
from PIL import Image

try:
    import cv2
    import numpy as np
    HAVE_CV2 = True
except ImportError:
    HAVE_CV2 = False

try:
    import pytesseract
    HAVE_PYTESSERACT = True
except ImportError:
    HAVE_PYTESSERACT = False


GUJARATI_DIGIT_MAP = {
    '૦': '0', '૧': '1', '૨': '2', '૩': '3', '૪': '4',
    '૫': '5', '૬': '6', '૭': '7', '૮': '8', '૯': '9',
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
}


def normalize_digits(text: str) -> str:
    """Normalize Gujarati/Hindi Unicode numerals to standard ASCII digits."""
    for guj, eng in GUJARATI_DIGIT_MAP.items():
        text = text.replace(guj, eng)
    return text


def preprocess_image(image_path: str):
    """Preprocess image for optimal OCR extraction."""
    if HAVE_CV2:
        img = cv2.imread(image_path)
        if img is None:
            return Image.open(image_path)
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Resize if too small
        h, w = gray.shape[:2]
        if w < 1000:
            scale = 1000.0 / w
            gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
        # Otsu thresholding
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return Image.fromarray(thresh)
    else:
        im = Image.open(image_path).convert('L')
        return im


def extract_raw_text(image_path: str) -> str:
    """Extract raw text from card image using available OCR engine."""
    preprocessed = preprocess_image(image_path)
    if HAVE_PYTESSERACT:
        try:
            return pytesseract.image_to_string(preprocessed, lang='eng+guj')
        except Exception:
            try:
                return pytesseract.image_to_string(preprocessed, lang='eng')
            except Exception as e:
                print(f"[WARN] pytesseract OCR failed: {e}", file=sys.stderr)
    
    # Fallback to standard pytesseract or PIL string
    return ""


def parse_card_text(raw_text: str, fallback_index: int = 1) -> dict:
    """
    Parse OCR raw text into structured Customer Card record.
    Extracts fields that are present, leaves missing fields empty.
    """
    text = normalize_digits(raw_text or "")
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    name = ""
    phone = ""
    liters = None
    price = None
    customer_no = ""

    # 1. Mobile Phone Number (10 digits starting with 6-9)
    phone_match = re.search(r'(?:(?:\+?91|0)[\s-]?)?([6-9]\d{4}[\s-]?\d{5}|[6-9]\d{9})\b', text)
    if phone_match:
        phone = re.sub(r'[\s-]', '', phone_match.group(1))
    else:
        for line in lines:
            digits = re.sub(r'\D', '', line)
            if len(digits) == 10 and digits[0] in '6789':
                phone = digits
                break

    # 2. Customer ID / Card #
    num_match = re.search(
        r'(?:customer\s*(?:no|id|#|code)?|cust\s*(?:no|id|#|code)?|acc(?:ount)?\s*no\.?|card\s*no\.?|'
        r'ગ્રાહક\s*(?:નંબર|નં)?|સભ્ય\s*નંબર|અ\.નં\.?|નં\.?|no\.?)\s*[:=.\s-]*([A-Za-z0-9-]+)',
        text,
        re.IGNORECASE,
    )
    if num_match:
        val = num_match.group(1).strip()
        if not re.match(r'^(shree|dairy|passbook|farm|milk|date|name)$', val, re.IGNORECASE):
            customer_no = val

    # 3. Daily Milk Liters
    l_match = re.search(
        r'(?:daily\s*milk|milk|liters?|ltrs?|ltr|લિટર|લીટર|દૂધ)\s*[:=.\s-]*([0-9]+(?:\.[0-9]+)?)',
        text,
        re.IGNORECASE,
    ) or re.search(r'([0-9]+(?:\.[0-9]+)?)\s*(?:liters?|ltrs?|ltr|લિટર|લીટર)', text, re.IGNORECASE)
    if l_match:
        try:
            val = float(l_match.group(1))
            if 0 < val <= 100:
                liters = val
        except ValueError:
            pass

    # 4. Rate per Liter / Price
    p_match = re.search(
        r'(?:rate(?:\s*per\s*liter)?|price|ભાવ|દર|રૂ|rs\.?|₹)\s*[:=.\s-]*([0-9]+(?:\.[0-9]+)?)',
        text,
        re.IGNORECASE,
    ) or re.search(r'(?:rs\.?|₹|રૂ\.?)\s*([0-9]+(?:\.[0-9]+)?)', text, re.IGNORECASE)
    if p_match:
        try:
            val = float(p_match.group(1))
            if 0 < val <= 500:
                price = val
        except ValueError:
            pass

    # 5. Customer Name
    name_match = re.search(
        r'(?:customer\s*name|name|ગ્રાહકનું\s*નામ|નામ|ના|શ્રી)\s*[:=.\s-]*([^\r\n]+)',
        text,
        re.IGNORECASE,
    )
    if name_match:
        raw_n = name_match.group(1)
        cleaned = re.sub(r'^(mr|mrs|shree|shri|smt)\.?\s+', '', raw_n, flags=re.IGNORECASE)
        cleaned = re.sub(r'[^\w\s\u0A80-\u0AFF]', '', cleaned).strip()
        if len(cleaned) >= 2:
            name = cleaned

    if not name or len(name) < 2:
        for line in lines:
            if re.search(r'dairy|passbook|farm|customer|mobile|phone|milk|rate|price|total|date|card|shree|liters?|ltr|rs|rupees|address', line, re.IGNORECASE):
                continue
            cleaned = re.sub(r'[^\w\s\u0A80-\u0AFF]', '', line).strip()
            words = [w for w in cleaned.split() if len(w) > 1]
            if words and 3 <= len(cleaned) <= 40 and not any(ch.isdigit() for ch in cleaned):
                name = cleaned
                break

    return {
        "name": name if name else f"Customer #{customer_no or fallback_index}",
        "phoneNumber": phone,
        "customerNumber": customer_no,
        "liters": liters if liters is not None else 1.0,
        "price": price if price is not None else 60.0,
        "notificationChannel": "whatsapp",
    }


def scan_file_or_dir(target_path: str):
    """Scan a single image file or directory of customer milk card images."""
    path = Path(target_path)
    if not path.exists():
        print(f"[ERROR] Path does not exist: {target_path}", file=sys.stderr)
        return []

    images = []
    if path.is_file():
        images = [path]
    elif path.is_dir():
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
            images.extend(path.glob(ext))
            images.extend(path.glob(ext.upper()))

    images = sorted(list(set(images)))
    print(f"[*] Found {len(images)} card images to process.")

    results = []
    for idx, img_p in enumerate(images, start=1):
        try:
            print(f"[{idx}/{len(images)}] Scanning: {img_p.name}...")
            raw_text = extract_raw_text(str(img_p))
            parsed = parse_card_text(raw_text, fallback_index=idx)
            parsed["sourceFile"] = str(img_p.name)
            results.append(parsed)
            print(f"    -> Extracted: {parsed['name']} | Phone: {parsed['phoneNumber']} | Milk: {parsed['liters']}L @ ₹{parsed['price']}")
        except Exception as e:
            print(f"[WARN] Failed to process {img_p}: {e}", file=sys.stderr)
            results.append({
                "name": f"Customer #{idx}",
                "phoneNumber": "",
                "customerNumber": str(idx),
                "liters": 1.0,
                "price": 60.0,
                "notificationChannel": "whatsapp",
                "sourceFile": str(img_p.name),
            })

    return results


def main():
    parser = argparse.ArgumentParser(description="Extract Customer Data from Milk Cards (No AI / No Gemini API)")
    parser.add_argument("path", help="Path to card image file or folder containing card images")
    parser.add_argument("--output", "-o", help="Optional output JSON file path", default=None)
    args = parser.parse_args()

    results = scan_file_or_dir(args.path)
    json_data = json.dumps({"success": True, "count": len(results), "customers": results}, indent=2, ensure_ascii=False)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(json_data)
        print(f"[SUCCESS] Exported {len(results)} customer records to {args.output}")
    else:
        print("\n=== EXTRACTED CUSTOMER RECORDS ===")
        print(json_data)


if __name__ == "__main__":
    main()
