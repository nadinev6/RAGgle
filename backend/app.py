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

@app.route('/search-products', methods=['POST'])
def search_products():
    """
    Search for products using Nuclia's search capabilities with optional date filtering,
    then retrieve structured product data from Supabase.
    """
    if not supabase:
        return jsonify({
            "success": False,
            "error": "Supabase not configured"
        }), 500

    data = request.get_json()
    query = data.get('query')
    from_date = data.get('fromDate')  # Expected format: YYYY-MM-DD
    to_date = data.get('toDate')      # Expected format: YYYY-MM-DD
    
    if not query:
        return jsonify({"success": False, "error": "Query is required"}), 400

    try:
        # Step 1: Search Nuclia for relevant resource IDs
        search_result = indexer.search_nuclia_resources(query, from_date, to_date)
        
        if not search_result.get("success"):
            return jsonify({
                "success": False, 
                "error": search_result.get("error", "Search failed")
            }), 500

        resource_ids = search_result.get("resource_ids", [])
        
        if not resource_ids:
            return jsonify({
                "success": True,
                "query": query,
                "summary": "No products found matching your search criteria.",
                "structured_data": {"products": []}
            })

        # Step 2: Get structured product data from Supabase
        supabase_query = supabase.table("products").select("*").in_("nuclia_document_id", resource_ids)
        
        # Add date filtering to Supabase query if dates are provided
        if from_date:
            supabase_query = supabase_query.gte("indexed_at", from_date + "T00:00:00")
        if to_date:
            supabase_query = supabase_query.lte("indexed_at", to_date + "T23:59:59")
        
        supabase_result = supabase_query.execute()
        
        if not supabase_result or not supabase_result.data:
            return jsonify({
                "success": True,
                "query": query,
                "summary": "Products were found in search but no detailed information is available.",
                "structured_data": {"products": []}
            })

        # Step 3: Convert Supabase data to frontend format
        products = []
        for product in supabase_result.data:
            product_data = {
                "name": product.get("name", "Unknown Product"),
                "price": product.get("price_text", "Price not available"),
                "description": product.get("description", "No description available"),
                "supplier": product.get("supplier", "Unknown Supplier"),
                "availability": product.get("availability", "Unknown"),
                "imageUrl": product.get("image_url", ""),
                "productUrl": product.get("product_url", ""),
                "category": "General",  # Could be enhanced with category extraction
                "rating": 0,  # Could be enhanced with rating extraction
                "features": []  # Could be enhanced with feature extraction
            }
            products.append(product_data)

        # Step 4: Get a natural language summary from Nuclia
        summary_result = indexer.ask_nuclia_nl(
            f"Summarize the products found for: {query}", 
            resource_ids[:10]  # Limit to first 10 resources for summary
        )
        
        summary = "Products found matching your search criteria."
        if summary_result.get("success") and summary_result.get("answer"):
            summary = summary_result.get("answer", summary)

        return jsonify({
            "success": True,
            "query": query,
            "summary": summary,
            "structured_data": {"products": products}
        })
        
    except Exception as e:
        logger.error(f"Error in search_products endpoint: {str(e)}")
        return jsonify({"success": False, "error": f"Internal server error: {e}"}), 500

@app.route('/index-url', methods=['POST'])
def index_url():
    """
    Indexes a URL using Nuclia, retrieves the extracted metadata,
    and stores the product data in Supabase.
    """
    data = request.get_json()
    url = data.get('url')
    is_product_page = data.get('is_product_page', False)
    if not url:
        return jsonify({"success": False, "error": "URL is required"}), 400

    try:
        # Step 1: Let Nuclia ingest the URL
        result = indexer.upload_from_url(url=url, title=f"Product from {url}")
        
        if not result.get("success"):
            return jsonify(result), 500

        document_id = result.get("document_id")
        if not document_id:
            return jsonify({"success": False, "error": "Failed to get document_id from Nuclia"}), 500
            
        # Step 2: Retrieve the resource from Nuclia to get extracted metadata
        resource_result = indexer.get_resource_by_id(document_id)
        extracted_details = {}
        
        if resource_result.get("success"):
            resource_data = resource_result.get("resource", {})
            usermetadata = resource_data.get("usermetadata", {})
            
            # Flatten the Nuclia usermetadata structure
            extracted_details = indexer._flatten_nuclia_usermetadata(usermetadata)
            logger.info(f"Retrieved metadata from Nuclia for document {document_id}")
        else:
            logger.warning(f"Failed to retrieve resource {document_id} from Nuclia: {resource_result.get('error')}")

        # Step 3: Store the product data in Supabase
        if supabase:
            # Set default values if not extracted
            extracted_details.setdefault("name", "Unknown Product")
            extracted_details.setdefault("price", "Price not available")
            extracted_details.setdefault("imageUrl", "")
            extracted_details.setdefault("description", "")
            extracted_details.setdefault("supplier", "Unknown Supplier")
            extracted_details.setdefault("availability", "Unknown")
            
            product_data = {
                "nuclia_document_id": document_id,
                "name": extracted_details.get("name", "Unknown Product"),
                "price_text": extracted_details.get("price", "Price not available"),
                "image_url": extracted_details.get("imageUrl", ""),
                "description": extracted_details.get("description", ""),
                "supplier": extracted_details.get("supplier", "Unknown Supplier"),
                "availability": extracted_details.get("availability", "Unknown"),
                "product_url": url,
                "last_updated": datetime.now().isoformat(),
                "product_type": "product" if is_product_page else "generic",
                "has_metadata": bool(extracted_details.get("imageUrl"))
            }

            supabase_result = supabase.table("products").upsert(product_data, on_conflict="nuclia_document_id").execute()
            logger.info(f"Upserted product data to Supabase for doc {document_id}")
            result["supabase_success"] = True
        else:
            result["supabase_success"] = False
        
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