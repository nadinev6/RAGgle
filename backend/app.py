"""
Flask Backend for Nuclia RAG E-commerce Application

This Flask application provides endpoints for e-commerce search, indexing,
and product management using Nuclia and Supabase.
"""

import os
import json
import logging
import requests
import re
from datetime import datetime
from typing import Dict, List, Optional, Any
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from supabase import create_client, Client

# IMPORTANT: Make sure your indexing.py file is in the same directory
from indexing import NucliaIndexer, extract_bn_product_details_from_content, extract_product_details_from_content

# --- Load environment variables ---
load_dotenv()

# --- Configure logging ---
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# --- Initialize Flask app and CORS ---
app = Flask(__name__)
CORS(app, origins=['http://localhost:3000', 'http://127.0.0.1:3000'], supports_credentials=True)

# --- Initialize Nuclia and Supabase Configuration ---
EDIT_API_KEY = os.getenv("NUCLIA_WRITER_API_KEY")
SEARCH_API_KEY = os.getenv("NUCLIA_READER_API_KEY")
ECOMMERCE_KB_ID = os.getenv("NUCLIA_KB_UID")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# --- Validate Configuration ---
if not all([EDIT_API_KEY, SEARCH_API_KEY, ECOMMERCE_KB_ID]):
    logger.critical("CRITICAL: Missing required Nuclia environment variables.")
    raise ValueError("Please set NUCLIA_WRITER_API_KEY, NUCLIA_READER_API_KEY, and NUCLIA_KB_UID in your .env file")

# --- Initialize Supabase client ---
supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_ANON_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        logger.info("Supabase client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("Supabase URL or Anon Key not set. Supabase integration will be disabled.")

# --- Initialize Nuclia indexer (one instance for the whole app) ---
indexer = NucliaIndexer(EDIT_API_KEY, SEARCH_API_KEY, ECOMMERCE_KB_ID)


# ======================================================================
# API ENDPOINTS
# ======================================================================

@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "Nuclia RAG E-commerce Backend",
        "timestamp": datetime.now().isoformat()
    })

@app.route('/ask-product-details', methods=['POST'])
def ask_product_details():
    """
    Ask Nuclia for structured product information using the /ask endpoint with JSON schema.
    """
    data = request.get_json()
    query = data.get('query')
    if not query:
        return jsonify({"success": False, "error": "Query is required"}), 400

    try:
        # Use the new ask_with_json_schema method
        result = indexer.ask_with_json_schema(query)
        
        if not result.get("success"):
            return jsonify({"success": False, "error": result.get("error", "Ask failed")}), 500

        return jsonify({
            "success": True,
            "query": query,
            "answer": result.get("answer"),
            "structured_data": result.get("structured_data"),
            "citations": result.get("citations", [])
        })
        
    except Exception as e:
        logger.error(f"Error in ask_product_details endpoint: {e}", exc_info=True)
        return jsonify({"success": False, "error": f"Internal server error: {e}"}), 500

@app.route('/index-url', methods=['POST'])
def index_url():
    """
    Indexes a URL, extracts product metadata, patches the Nuclia resource,
    and stores the product data in Supabase.
    """
    data = request.get_json()
    url = data.get('url')
    is_product_page = data.get('is_product_page', False)
    if not url:
        return jsonify({"success": False, "error": "URL is required"}), 400

    try:
        # Step 1: Let Nuclia ingest the URL first. This is fast and gets a document_id.
        result = indexer.upload_from_url(url=url, title=f"Product from {url}")
        
        if not result.get("success"):
            return jsonify(result), 500

        document_id = result.get("document_id")
        if not document_id:
            return jsonify({"success": False, "error": "Failed to get document_id from Nuclia"}), 500
            
        # Step 2: In parallel, fetch the content to extract metadata yourself
        response = requests.get(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }, timeout=60)
        response.raise_for_status()
        content = response.text

        # Step 3: Extract product details from the content
        extraction_function = extract_bn_product_details_from_content if "barnesandnoble.com" in url.lower() else extract_product_details_from_content
        extracted_details = extraction_function(content, url)
        
        # Step 4: Patch the Nuclia resource with the structured metadata
        patch_result = indexer.patch_resource(document_id, extracted_details)
        if patch_result["success"]:
            logger.info(f"Successfully patched resource {document_id} with metadata.")
            result["metadata_patch_success"] = True
        else:
            logger.warning(f"Failed to patch resource {document_id}: {patch_result.get('error')}")
            result["metadata_patch_success"] = False

        # Step 5: Store the final product data in Supabase
        if supabase:
            product_data = {
                "nuclia_document_id": document_id,
                "name": extracted_details.get("name", "Unknown Product"),
                "author": extracted_details.get("author", "Unknown Author"),
                "price_text": extracted_details.get("price", "Price not available"),
                "image_url": extracted_details.get("imageUrl", ""),
                "description": extracted_details.get("description", ""),
                "supplier": extracted_details.get("supplier", "Unknown Supplier"),
                "availability": extracted_details.get("availability", "Unknown"),
                "product_url": extracted_details.get("productUrl", url),
                "last_updated": datetime.now().isoformat(),
                "product_type": "product" if is_product_page else "generic",
                "has_metadata": is_product_page and bool(extracted_details.get("imageUrl"))
            }
            # Add price history logic if price can be parsed
            price_match = re.search(r'[\d,]+\.?\d*', product_data["price_text"].replace(',', ''))
            if price_match:
                try:
                    price_value = float(price_match.group())
                    # You would need a separate call to store price history after getting the product ID
                except ValueError:
                    pass

            supabase_result = supabase.table("products").upsert(product_data, on_conflict="nuclia_document_id").execute()
            logger.info(f"Upserted product data to Supabase for doc {document_id}")
            result["supabase_result"] = str(supabase_result)
        
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error in index_url endpoint: {e}", exc_info=True)
        return jsonify({"success": False, "error": f"Internal server error: {e}"}), 500

@app.route('/list-products', methods=['GET'])
def list_products():
    """Lists all indexed resources from Nuclia."""
    limit = request.args.get('limit', 100, type=int)
    result = indexer.list_resources(limit=limit)
    return jsonify(result)

@app.route('/nuclia-config', methods=['GET'])
def get_nuclia_config():
    """Provide Nuclia configuration for the chat widget."""
    return jsonify({
        "success": True,
        "authtoken": SEARCH_API_KEY,
        "knowledgebox": ECOMMERCE_KB_ID,
        "zone": "aws-eu-central-1-1"
    })

if __name__ == '__main__':
    logger.info("Starting Nuclia RAG Search Engine...")
    app.run(host='127.0.0.1', port=5000, debug=True)