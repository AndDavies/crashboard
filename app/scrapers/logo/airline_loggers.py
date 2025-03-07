import cloudscraper
from bs4 import BeautifulSoup
import os
import time
import json
from datetime import datetime

# Starting URL
BASE_URL = "https://www.bringfido.com/travel/"
OUTPUT_DIR = "../../logos_downloaded"  # Relative to app/scrapers/logo/
LOG_FILE = "scrape_log.json"

# Initialize cloudscraper
scraper = cloudscraper.create_scraper()

def ensure_directory_exists(directory):
    print(f"Checking/creating directory: {directory}")
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"Created directory: {directory}")

def save_log(start_time, end_time, results, skipped):
    log_entry = {
        "date": datetime.now().isoformat(),
        "runtime_seconds": end_time - start_time,
        "logos_downloaded": results,
        "skipped": skipped  # Add skipped entries for debugging
    }
    logs = []
    if os.path.exists(LOG_FILE):
        print(f"Reading existing log file: {LOG_FILE}")
        with open(LOG_FILE, "r") as f:
            logs = json.load(f)
    logs.append(log_entry)
    print(f"Saving log entry: {log_entry}")
    with open(LOG_FILE, "w") as f:
        json.dump(logs, f, indent=2)
    print(f"Log saved to {LOG_FILE}")

def download_logo(src, alt):
    # Validate src is a proper URL
    if not src or not src.startswith("http"):
        print(f"Skipping invalid URL: {src} (alt: {alt})")
        return None
    
    filename = alt.lower().replace(" ", "_") + ".jpg"
    filepath = os.path.join(OUTPUT_DIR, filename)
    print(f"Downloading {src} as {filename}")
    
    response = scraper.get(src)
    if response.status_code == 200:
        with open(filepath, "wb") as f:
            f.write(response.content)
        print(f"Saved {filename}")
        return filename
    else:
        print(f"Failed to download {src}: Status {response.status_code}")
    return None

def scrape_airlines():
    start_time = time.time()
    logos_downloaded = []
    skipped = []  # Track invalid/skipped entries
    url = BASE_URL

    print(f"Starting scrape at {BASE_URL}")
    ensure_directory_exists(OUTPUT_DIR)

    while url:
        print(f"Fetching page: {url}")
        response = scraper.get(url)
        if response.status_code != 200:
            print(f"Failed to fetch {url}: Status {response.status_code}")
            break
        
        print("Parsing HTML...")
        soup = BeautifulSoup(response.text, "html.parser")
        
        logo_tiles = soup.find_all("div", class_="logoTile")
        print(f"Found {len(logo_tiles)} logo tiles on page")
        for tile in logo_tiles:
            img = tile.find("amp-img")
            if img:
                src = img.get("src")
                alt = img.get("alt")
                if src and alt:
                    filename = download_logo(src, alt)
                    if filename:
                        logos_downloaded.append(filename)
                    elif src:  # If src exists but download failed/invalid
                        skipped.append({"src": src, "alt": alt})
        
        see_more = soup.find("a", class_="resultsList__loadMore__btn")
        url = None
        if see_more:
            href = see_more.get("href")
            if href:
                url = "https://www.bringfido.com" + href
                print(f"Next page found: {url}")
        else:
            print("No more pages to scrape")
            break

    end_time = time.time()
    save_log(start_time, end_time, logos_downloaded, skipped)
    print(f"Scraped {len(logos_downloaded)} logos, skipped {len(skipped)} entries in {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    scrape_airlines()