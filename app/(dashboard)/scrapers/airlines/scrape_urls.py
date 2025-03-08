# ~/Projects/crashboard/app/(dashboard)/scrapers/airlines/scrape_urls.py
import requests
from bs4 import BeautifulSoup
import json
import time
from random import uniform
import os

BASE_URL = "https://www.bringfido.com/travel/"
OUTPUT_DIR = "../../../policies_downloaded"
OUTPUT_FILE = f"{OUTPUT_DIR}/urls.json"

def ensure_directory_exists(directory):
    print(f"Checking/creating directory: {directory}")
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"Created directory: {directory}")

def save_urls(urls):
    ensure_directory_exists(OUTPUT_DIR)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(urls, f, indent=2)
    print(f"Saved {len(urls)} URLs to {OUTPUT_FILE}")

def scrape_urls():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    page = 1
    all_urls = set()  # Use set to avoid duplicates

    while True:
        url = f"{BASE_URL}?page={page}" if page > 1 else BASE_URL
        print(f"Fetching page: {url}")
        
        try:
            response = requests.get(url, headers=headers, timeout=10)
            print(f"Status code: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Failed to fetch {url}: {response.text[:200]}")
                break
            
            soup = BeautifulSoup(response.text, "html.parser")
            logo_tiles = soup.find_all("div", class_="logoTile")
            print(f"Found {len(logo_tiles)} logoTile elements")
            
            if not logo_tiles:
                print("No logoTile elements found, stopping.")
                break
            
            for tile in logo_tiles:
                link = tile.find("a", class_="logoTile__thumbnail")
                if link and "href" in link.attrs:
                    href = link["href"]
                    full_url = f"https://www.bringfido.com{href}" if href.startswith("/") else href
                    all_urls.add(full_url)
                    print(f"Added URL: {full_url}")
            
            see_more = soup.find("a", class_="resultsList__loadMore__btn")
            if not see_more or not see_more.get("href"):
                print("No more pages to scrape")
                break
            
            page += 1
            delay = uniform(1, 2)
            print(f"Waiting {delay:.2f} seconds before next request...")
            time.sleep(delay)
        
        except requests.RequestException as e:
            print(f"Error fetching {url}: {e}")
            break
    
    url_list = list(all_urls)
    save_urls(url_list)
    return url_list

if __name__ == "__main__":
    print("Starting URL scrape...")
    urls = scrape_urls()
    print(f"Completed. Scraped {len(urls)} URLs.")