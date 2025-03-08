import requests
import json
import time
import os
from bs4 import BeautifulSoup
from random import uniform

FIRECRAWL_API_KEY = "fc-7f8067c125c945d5a293734007f28545"
FIRECRAWL_API_URL = "https://api.firecrawl.dev/v0/extract"
BASE_URL = "https://www.bringfido.com/travel/"
OUTPUT_DIR = "../../../policies_downloaded"  # Changed from logos_downloaded
LOG_FILE = "policy_scrape_log.json"
OUTPUT_FILE = f"{OUTPUT_DIR}/airline_policies.json"

def ensure_directory_exists(directory):
    print(f"Checking/creating directory: {directory}")
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"Created directory: {directory}")

def save_log(start_time, end_time, results, debug_info=None):
    log_entry = {
        "date": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "runtime_seconds": end_time - start_time,
        "policies_scraped": results,
        "debug_info": debug_info or {}
    }
    logs = []
    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "r") as f:
            logs = json.load(f)
    logs.append(log_entry)
    print(f"Saving log entry: {json.dumps(log_entry, indent=2)}")
    with open(LOG_FILE, "w") as f:
        json.dump(logs, f, indent=2)
    print(f"Log saved to {LOG_FILE}")

def save_policies(policies):
    ensure_directory_exists(OUTPUT_DIR)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(policies, f, indent=2)
    print(f"Saved {len(policies)} policies to {OUTPUT_FILE}")

def scrape_policy_page(url, retries=5, rate_limit_count=[0]):
    if not url.startswith("http"):
        print(f"Skipping invalid URL: {url}")
        return {"airline_name": url, "error": "Invalid URL format"}
    
    headers = {"Authorization": f"Bearer {FIRECRAWL_API_KEY}"}
    schema = {
        "type": "object",
        "properties": {
            "airline_name": {"type": "string"},
            "website_link": {"type": "string"},
            "phone_number": {"type": "string"},
            "pets_in_cabin": {"type": "string"},
            "pets_in_checked_baggage": {"type": "string"},
            "pets_in_cargo": {"type": "string"},
            "carrier_guidelines": {"type": "string"},
            "other_restrictions": {"type": "string"}
        },
        "required": ["airline_name"]
    }
    payload = {
        "url": url,
        "extractorOptions": {
            "mode": "llm-extraction",
            "schema": schema,
            "prompt": "Extract airline pet policy details including the airline name, website link, phone number, and specific sections: 'Pets in the Cabin', 'Pets in Checked Baggage', 'Pets in Cargo', 'Carrier Guidelines', and 'Other Restrictions' from the page. Ignore reviews for now."
        }
    }
    for attempt in range(retries):
        print(f"Fetching policy page: {url} (Attempt {attempt + 1}/{retries})")
        try:
            response = requests.post(FIRECRAWL_API_URL, headers=headers, json=payload, timeout=30)
            print(f"Firecrawl response status: {response.status_code}")
            
            if response.status_code == 429:
                rate_limit_count[0] += 1
                wait_time = uniform(10, 20) * (2 ** attempt)
                print(f"Rate limited (429). Waiting {wait_time:.2f} seconds... (Total 429s: {rate_limit_count[0]})")
                time.sleep(wait_time)
                continue
            if response.status_code != 200:
                print(f"Failed to fetch {url}: Status {response.status_code}, Response: {response.text}")
                return {"airline_name": url.split('/')[-2] if '/' in url else url, "error": f"Status {response.status_code}"}
            
            data = response.json()
            print(f"Firecrawl raw response: {json.dumps(data, indent=2)}")
            if not data.get("success"):
                print(f"Firecrawl error: {data.get('error')}")
                return {"airline_name": url.split('/')[-2] if '/' in url else url, "error": data.get('error')}
            
            extracted_data = data.get("data", {}).get("llm_extraction", {})
            if not extracted_data:
                print(f"No extracted data found in response: {data}")
                return {"airline_name": url.split('/')[-2] if '/' in url else url, "error": "No extracted data"}
            
            policy = {
                "airline_name": extracted_data.get("airline_name", url.split('/')[-2].replace('_', ' ').title()),
                "website_link": extracted_data.get("website_link", ""),
                "phone_number": extracted_data.get("phone_number", ""),
                "pets_in_cabin": extracted_data.get("pets_in_cabin", ""),
                "pets_in_checked_baggage": extracted_data.get("pets_in_checked_baggage", ""),
                "pets_in_cargo": extracted_data.get("pets_in_cargo", ""),
                "carrier_guidelines": extracted_data.get("carrier_guidelines", ""),
                "other_restrictions": extracted_data.get("other_restrictions", "")
            }
            return policy
        except Exception as e:
            print(f"Error fetching {url}: {str(e)}")
            wait_time = uniform(10, 20) * (2 ** attempt)
            time.sleep(wait_time)
            continue
    print(f"Failed after {retries} attempts for {url}")
    return {"airline_name": url.split('/')[-2] if '/' in url else url, "error": "Max retries exceeded"}

def scrape_airline_policies():
    start_time = time.time()
    policies = []
    debug_info = {}
    rate_limit_count = [0]

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    page = 1
    policy_urls = []
    while True:
        url = f"{BASE_URL}?page={page}" if page > 1 else BASE_URL
        print(f"Fetching main page: {url}")
        main_response = requests.get(url, headers=headers)
        debug_info[f"main_page_status_page_{page}"] = main_response.status_code
        print(f"Main page status: {main_response.status_code}")
        
        if main_response.status_code != 200:
            debug_info[f"main_page_error_page_{page}"] = main_response.text[:200]
            print(f"Main page fetch failed: {main_response.text[:200]}")
            break
        
        main_soup = BeautifulSoup(main_response.text, "html.parser")
        logo_tiles = main_soup.find_all("div", class_="logoTile")
        debug_info[f"logo_tiles_count_page_{page}"] = len(logo_tiles)
        print(f"Found {len(logo_tiles)} logoTile elements")
        
        all_links = main_soup.find_all("a", href=True)
        debug_info[f"total_links_page_{page}"] = len(all_links)
        for tile in logo_tiles:
            link = tile.find("a", href=True)
            if link:
                href = link["href"]
                debug_info.setdefault("found_hrefs", []).append(href)
                full_url = f"https://www.bringfido.com{href}" if href.startswith("/") else href
                if full_url not in policy_urls:
                    policy_urls.append(full_url)
                    print(f"Added policy URL: {full_url}")
        
        see_more = main_soup.find("a", class_="resultsList__loadMore__btn")
        if not see_more or not see_more.get("href"):
            print("No more pages to scrape")
            break
        page += 1
        time.sleep(1)

    debug_info["policy_urls_count"] = len(policy_urls)
    print(f"Found {len(policy_urls)} policy pages")

    batch_size = 5
    for i in range(0, len(policy_urls), batch_size):
        batch = policy_urls[i:i + batch_size]
        print(f"Processing batch {i // batch_size + 1}: URLs {i + 1} to {min(i + batch_size, len(policy_urls))}")
        for j, url in enumerate(batch, i + 1):
            print(f"Processing {j}/{len(policy_urls)}: {url}")
            policy = scrape_policy_page(url, rate_limit_count=rate_limit_count)
            if policy:
                policies.append(policy)
            save_policies(policies)
            delay = uniform(10, 20) if rate_limit_count[0] < 5 else uniform(20, 30)
            print(f"Waiting {delay:.2f} seconds before next request...")
            time.sleep(delay)
        if i + batch_size < len(policy_urls):
            print(f"Batch complete. Pausing 120 seconds to reset rate limit...")
            time.sleep(120)

    end_time = time.time()
    save_log(start_time, end_time, [p["airline_name"] for p in policies], debug_info)
    print(f"Scraped {len(policies)} policies in {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    scrape_airline_policies()