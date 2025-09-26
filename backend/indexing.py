import os
import json
import logging
import requests
import re
import html
from datetime import datetime
from typing import Dict, List, Optional, Any
from dotenv import load_dotenv

# Load env vars
load_dotenv()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class NucliaIndexer:
    """
    Handles document indexing with Nuclia's API.
    """

    def __init__(self, edit_api_key: str, search_api_key: str, knowledge_base_id: str):
        self.edit_api_key = edit_api_key
        self.search_api_key = search_api_key
        self.knowledge_base_id = knowledge_base_id
        self.base_url = "https://aws-eu-central-1-1.rag.progress.cloud/api"
        self.kb_base_url = f"{self.base_url}/v1/kb/{knowledge_base_id}"

    def _get_edit_headers(self) -> Dict[str, str]:
        return {
            "X-NUCLIA-SERVICEACCOUNT": f"Bearer {self.edit_api_key}",
            "Content-Type": "application/json"
        }

    def _get_search_headers(self) -> Dict[str, str]:
        return {
            "X-NUCLIA-SERVICEACCOUNT": f"Bearer {self.search_api_key}",
            "Content-Type": "application/json"
        }

    def _format_metadata_for_nuclia(self, metadata: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Formats a flat metadata dictionary into the nested structure Nuclia expects.
        Example: {"key": "value"} -> {"fields": {"key": {"value": "value"}}}
        """
        if not metadata:
            return None

        formatted_fields = {}
        for key, value in metadata.items():
            # Ensure value is not None or an empty string before adding
            if value is not None and value != "":
                formatted_fields[key] = {"value": str(value)}  # Ensure value is a string
        
        # Only return the structure if there are fields to add
        if formatted_fields:
            return {"fields": formatted_fields}
        return None
    
    def _handle_request_exception(self, e: requests.RequestException, method_name: str) -> Dict[str, Any]:
        """Centralized exception handler for better logging."""
        error_details = str(e)
        if e.response is not None:
            try:
                error_details += f" | Response: {e.response.json()}"
            except json.JSONDecodeError:
                error_details += f" | Response: {e.response.text}"
        logger.error(f"{method_name} failed: {error_details}")
        return {"success": False, "error": error_details}

    def upload_document(self,
                        content: str,
                        title: str,
                        source_url: Optional[str] = None,
                        document_type: str = "text",
                        metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Upload a text/html document, Nuclia auto-extracts NER, vectors, graph, etc.
        """
        url = f"{self.kb_base_url}/resources"
        payload = {
            "title": title,
            "texts": {
                "text": {
                    "body": content,
                    "format": "PLAIN" if document_type == "text" else "HTML"
                }
            }
        }
        if source_url:
            payload["origin"] = {
                "source_id": source_url,
                "url": source_url,
                "created": datetime.now().isoformat()
            }
        if metadata:
            formatted_metadata = self._format_metadata_for_nuclia(metadata)
            if formatted_metadata:
                payload["usermetadata"] = formatted_metadata

        try:
            resp = requests.post(url, headers=self._get_edit_headers(), json=payload)
            resp.raise_for_status()
            result = resp.json()
            uid = result.get("uuid", "")
            logger.info(f"Uploaded document {uid}")
            return {"success": True, "document_id": uid, "response": result}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "upload_document")

    def upload_text(self,
                    title: str,
                    text: str,
                    metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Upload plain text for manual product entry.
        """
        url = f"{self.kb_base_url}/resources"
        payload = {
            "title": title,
            "texts": {
                "text": {"body": text, "format": "PLAIN"}
            }
        }
        if metadata:
            formatted_metadata = self._format_metadata_for_nuclia(metadata)
            if formatted_metadata:
                payload["usermetadata"] = formatted_metadata

        try:
            resp = requests.post(url, headers=self._get_edit_headers(), json=payload)
            resp.raise_for_status()
            result = resp.json()
            uid = result.get("uuid", "")
            logger.info(f"Uploaded manual text {uid}")
            return {"success": True, "document_id": uid, "response": result}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "upload_text")

    def upload_from_url(self,
                        url: str,
                        title: Optional[str] = None,
                        metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Fetch & index a remote URL.
        """
        if not title:
            title = f"Content from {url}"
        api_url = f"{self.kb_base_url}/resources"
        payload = {
            "title": title,
            "links": {"link": {"uri": url}}
        }
        if metadata:
            formatted_metadata = self._format_metadata_for_nuclia(metadata)
            if formatted_metadata:
                payload["usermetadata"] = formatted_metadata

        try:
            resp = requests.post(api_url, headers=self._get_edit_headers(), json=payload)
            resp.raise_for_status()
            result = resp.json()
            uid = result.get("uuid", "")
            logger.info(f"Indexed URL {uid}")
            return {"success": True, "document_id": uid, "response": result}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "upload_from_url")

    def patch_resource(self, document_id: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing resource’s usermetadata.
        Note: The payload for patching should already be in the correct Nuclia format.
        """
        url = f"{self.kb_base_url}/resource/{document_id}"
        formatted_metadata = self._format_metadata_for_nuclia(metadata)
        if not formatted_metadata:
            return {"success": False, "error": "No valid metadata provided to patch."}
            
        payload = {"usermetadata": formatted_metadata}
        try:
            resp = requests.patch(url, headers=self._get_edit_headers(), json=payload)
            resp.raise_for_status()
            logger.info(f"Patched {document_id}")
            return {"success": True, "document_id": document_id, "response": resp.json()}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "patch_resource")

    def ask_with_json_schema(self, query: str) -> Dict[str, Any]:
        """
        Ask Nuclia for structured product information using the /ask endpoint with JSON schema.
        This version is robustly designed to handle multiple JSON objects (JSON Lines/ndjson)
        in the API response.
        """
        url = f"{self.kb_base_url}/ask"
        
        # Define the JSON schema for structured product data
        product_schema = {
            "title": "E-commerce Product Search Result",
            "type": "object",
            "properties": {
                "products": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Product name or title"},
                            "price": {"type": "string", "description": "Product price with currency"},
                            "description": {"type": "string", "description": "Product description"},
                            "supplier": {"type": "string", "description": "Supplier or brand name"},
                            "availability": {"type": "string", "description": "Stock availability status"},
                            "imageUrl": {"type": "string", "description": "Product image URL"},
                            "productUrl": {"type": "string", "description": "Original product page URL"},
                            "category": {"type": "string", "description": "Product category"},
                            "rating": {"type": "number", "description": "Product rating if available"},
                            "features": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Key product features or specifications"
                            }
                        },
                        "required": [
                            "name", "price", "description", "supplier", "availability",
                            "imageUrl", "productUrl", "category", "rating", "features"
                        ],
                        "additionalProperties": False
                    }
                },
                "summary": {"type": "string", "description": "Summary of the search results"}
            },
            "required": ["products"]
        }
        
        payload = {
            "query": query,
            "answer_json_schema": product_schema
        }
        
        logger.debug(f"Calling /ask with payload: {json.dumps(payload, indent=2)}")
        
        try:
            resp = requests.post(url, headers=self._get_search_headers(), json=payload)
            resp.raise_for_status()
            result = resp.json()
            
            answer = result.get("answer", "")
            citations = result.get("citations", [])
            
            # --- START: NEW ROBUST JSON LINES PARSING LOGIC ---
            structured_data_list = []
            decoder = json.JSONDecoder()
            pos = 0
            
            # Trim leading whitespace from the answer
            answer = answer.lstrip()

            # Loop through the string, decoding one JSON object at a time
            while pos < len(answer):
                try:
                    obj, end = decoder.raw_decode(answer[pos:])
                    structured_data_list.append(obj)
                    # Move position to the start of the next object
                    pos += end
                    # Skip whitespace/newlines between objects
                    while pos < len(answer) and answer[pos].isspace():
                        pos += 1
                except json.JSONDecodeError:
                    # Could not decode further, likely trailing text. Stop parsing.
                    logger.warning(f"Stopped parsing JSON stream. Remainder: {answer[pos:pos+100]}...")
                    break

            # --- COMBINE PARSED OBJECTS INTO FINAL STRUCTURE ---
            final_structured_data = {"products": [], "summary": ""}
            if structured_data_list:
                all_products = []
                summaries = []
                for item in structured_data_list:
                    if isinstance(item, dict):
                        # Add products from the 'products' key if it exists
                        if 'products' in item and isinstance(item['products'], list):
                            all_products.extend(item['products'])
                        # If the object itself is a product, add it
                        elif 'name' in item and 'price' in item:
                            all_products.append(item)
                        # Collect summaries
                        if 'summary' in item and item['summary']:
                            summaries.append(item['summary'])
                
                final_structured_data["products"] = all_products
                final_structured_data["summary"] = " | ".join(summaries)

            if not final_structured_data["products"]:
                 logger.warning(f"Could not extract any valid product data from parsed JSON: {structured_data_list}")
            # --- END: NEW LOGIC ---
                    
            return {
                "success": True,
                "answer": answer, # The raw answer from the API
                "structured_data": final_structured_data if final_structured_data["products"] else None,
                "citations": citations
            }
            
        except requests.RequestException as e:
            return self._handle_request_exception(e, "ask_with_json_schema")

    def get_document_entities(self, document_id: str) -> Dict[str, Any]:
        url = f"{self.kb_base_url}/resource/{document_id}"
        try:
            resp = requests.get(url, headers=self._get_search_headers())
            resp.raise_for_status()
            data = resp.json().get("data", {})
            return {"success": True, "entities": data.get("entities", {}), "relations": data.get("relations", [])}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "get_document_entities")

    def rephrase_query(self, query: str, context: Optional[List[str]] = None) -> Dict[str, Any]:
        url = f"{self.kb_base_url}/predict/rephrase"
        payload = {"query": query}
        if context:
            payload["context"] = context
        try:
            resp = requests.post(url, headers=self._get_search_headers(), json=payload)
            resp.raise_for_status()
            result = resp.json()
            return {"success": True, "rephrased_query": result.get("rephrased_query", query)}
        except requests.RequestException as e:
            response = self._handle_request_exception(e, "rephrase_query")
            response["rephrased_query"] = query # a rephrase failure should still return the original query
            return response

    def get_resource_by_id(self, document_id: str) -> Dict[str, Any]:
        url = f"{self.kb_base_url}/resource/{document_id}"
        try:
            resp = requests.get(url, headers=self._get_search_headers())
            resp.raise_for_status()
            return {"success": True, "resource": resp.json()}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "get_resource_by_id")

    def _flatten_nuclia_usermetadata(self, nuclia_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Flatten Nuclia's nested usermetadata structure.
        Converts {"fields": {"key": {"value": "value"}}} to {"key": "value"}
        """
        flattened = {}
        if not nuclia_metadata or not isinstance(nuclia_metadata, dict):
            return flattened
            
        fields = nuclia_metadata.get("fields", {})
        if not isinstance(fields, dict):
            return flattened
            
        for key, value_obj in fields.items():
            if isinstance(value_obj, dict) and "value" in value_obj:
                flattened[key] = value_obj["value"]
            else:
                # Fallback for unexpected structure
                flattened[key] = str(value_obj)
                
        return flattened

    def list_resources(self, limit: int = 100) -> Dict[str, Any]:
        url = f"{self.kb_base_url}/resources"
        params = {"page": 0, "size": limit}
        try:
            resp = requests.get(url, headers=self._get_search_headers(), params=params)
            resp.raise_for_status()
            resources = resp.json().get("resources", [])
            return {"success": True, "resources": resources}
        except requests.RequestException as e:
            return self._handle_request_exception(e, "list_resources")


def extract_bn_product_details_from_content(content: str, source_url: str = "") -> dict:
    """Extract Barnes & Noble specific product details from productDetail-container."""
    
    logger.debug(f"=== B&N EXTRACTION FUNCTION CALLED ===")
    logger.debug(f"Content length received: {len(content)}")
    logger.debug(f"Source URL: {source_url}")
    
    product_details = {
        "name": "Unknown Product",
        "price": "Price not available",
        "imageUrl": "https://via.placeholder.com/300x300?text=No+Image",
        "description": "No description available.",
        "supplier": "Barnes & Noble",
        "author": "Unknown Author",
        "availability": "Unknown",
        "productUrl": source_url
    }
    
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(content, 'html.parser')
        
        # Find the main product container
        product_container = soup.find('div', id='productDetail-container')
        if not product_container:
            logger.warning("Could not find productDetail-container")
            return product_details
        
        logger.debug("✅ Found productDetail-container")
        
        # Extract author from the specific B&N structure within the container
        author_section = product_container.find('div', id='pdp-header-authors')
        if author_section:
            logger.debug("✅ Found pdp-header-authors section")
            
            # Method 1: Look for the hidden input with author value
            author_input = author_section.find('input', id='author')
            if author_input and author_input.get('value'):
                product_details["author"] = author_input['value']
                logger.debug(f"✅ Extracted author from input: {product_details['author']}")
            
            # Method 2: Extract from the link text as fallback
            elif not product_details["author"] or product_details["author"] == "Unknown Author":
                author_link = author_section.find('a')
                if author_link and author_link.text.strip():
                    product_details["author"] = author_link.text.strip()
                    logger.debug(f"✅ Extracted author from link: {product_details['author']}")
        else:
            logger.debug("❌ Could not find pdp-header-authors section")
        
        # Extract product title
        title_elements = [
            product_container.find('h1', class_=lambda x: x and 'title' in x.lower()),
            product_container.find('h1'),
            product_container.find(attrs={'data-testid': 'product-title'}),
            product_container.find('div', class_=lambda x: x and 'product-title' in x.lower())
        ]
        
        for title_elem in title_elements:
            if title_elem and title_elem.text.strip():
                product_details["name"] = title_elem.text.strip()
                logger.debug(f"✅ Extracted title: {product_details['name']}")
                break
        
        # Extract price
        price_elements = [
            product_container.find(attrs={'data-testid': 'price'}),
            product_container.find('span', class_=lambda x: x and 'price' in x.lower()),
            product_container.find('div', class_=lambda x: x and 'price' in x.lower()),
            product_container.find(string=re.compile(r'\$\d+\.\d+'))
        ]
        
        for price_elem in price_elements:
            if price_elem:
                price_text = price_elem.text.strip() if hasattr(price_elem, 'text') else str(price_elem).strip()
                if '$' in price_text:
                    product_details["price"] = price_text
                    logger.debug(f"✅ Extracted price: {product_details['price']}")
                    break
        
        # Extract description
        description_elements = [
            product_container.find('div', class_=lambda x: x and 'overview' in x.lower()),
            product_container.find('div', class_=lambda x: x and 'description' in x.lower()),
            product_container.find('div', class_=lambda x: x and 'summary' in x.lower()),
            product_container.find(attrs={'data-testid': 'description'})
        ]
        
        for desc_elem in description_elements:
            if desc_elem and desc_elem.text.strip():
                desc_text = desc_elem.text.strip()
                if len(desc_text) > 20:  # Only use if substantial
                    product_details["description"] = desc_text[:500] + "..." if len(desc_text) > 500 else desc_text
                    logger.debug(f"✅ Extracted description: {product_details['description'][:100]}...")
                    break
        
        # Extract image
        image_elements = [
            product_container.find('img', id='pdpMainImage'),  # Priority for B&N main product image
            product_container.find('img', class_=lambda x: x and 'product' in x.lower()),
            product_container.find('img', attrs={'data-testid': 'product-image'}),
            product_container.find('div', class_=lambda x: x and 'image' in x.lower()).find('img') if product_container.find('div', class_=lambda x: x and 'image' in x.lower()) else None,
            product_container.find('img')  # Any img as fallback
        ]
        
        for img_elem in image_elements:
            if img_elem:
                img_url = img_elem.get('src') or img_elem.get('data-src') or img_elem.get('data-lazy-src')
                if img_url and not img_url.startswith('data:'):
                    # Handle relative URLs
                    if img_url.startswith('//'):
                        img_url = 'https:' + img_url
                    elif img_url.startswith('/'):
                        img_url = 'https://www.barnesandnoble.com' + img_url
                    
                    product_details["imageUrl"] = img_url
                    logger.debug(f"✅ Extracted image: {img_url}")
                    break
        
        # Extract availability
        availability_elements = [
            product_container.find(attrs={'data-testid': 'availability'}),
            product_container.find('span', class_=lambda x: x and 'availability' in x.lower()),
            product_container.find('div', class_=lambda x: x and 'stock' in x.lower())
        ]
        
        for avail_elem in availability_elements:
            if avail_elem and avail_elem.text.strip():
                product_details["availability"] = avail_elem.text.strip()
                logger.debug(f"✅ Extracted availability: {product_details['availability']}")
                break
                
    except ImportError:
        logger.error("❌ BeautifulSoup4 is not installed! Run: pip install beautifulsoup4")
        return product_details
    except Exception as e:
        logger.error(f"❌ Error extracting B&N product details: {e}")
    
    # Fallback regex patterns if BeautifulSoup didn't find everything
    if product_details["author"] == "Unknown Author":
        author_patterns = [
            r'<input[^>]*id=["\']author["\'][^>]*value=["\']([^"\']+)["\']',
            r'by\s*<a[^>]*href=[^>]*>([^<]+)</a>',
        ]
        
        for pattern in author_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                product_details["author"] = match.group(1).strip()
                logger.debug(f"✅ Extracted author via regex: {product_details['author']}")
                break
    
    logger.debug(f"=== FINAL EXTRACTION RESULTS ===")
    for key, value in product_details.items():
        logger.debug(f"  {key}: '{str(value)[:100]}'") # Truncate long values for logging
    logger.debug(f"=== END B&N EXTRACTION ===")
    
    return product_details    


def extract_product_details_from_content(content: str, source_url: str = "") -> Dict[str, Any]:
    """
    Enhanced extraction that first tries JSON-LD, then falls back to regex patterns.
    
    Args:
        content: Raw HTML content
        source_url: Source URL of the content
        
    Returns:
        Dictionary containing extracted product details
    """
    details = {
        "name": "Unknown Product",
        "price": "Price not available",
        "currency": "USD",
        "imageUrl": "https://via.placeholder.com/300x300?text=No+Image",
        "description": content[:200] + "..." if len(content) > 200 else content,
        "supplier": "Unknown Supplier",
        "productUrl": source_url,
        "availability": "Unknown"
    }

    # First, try to extract from JSON-LD structured data
    json_ld_patterns = [
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        r'"@type"\s*:\s*"Product"[^}]*}',
    ]
    
    for pattern in json_ld_patterns:
        matches = re.findall(pattern, content, re.IGNORECASE | re.DOTALL)
        for match in matches:
            try:
                json_data = json.loads(match.strip())
                if isinstance(json_data, dict) and json_data.get("@type") == "Product":
                    # Extract from JSON-LD
                    if "name" in json_data:
                        details["name"] = json_data["name"]
                    if "offers" in json_data and isinstance(json_data["offers"], dict):
                        price = json_data["offers"].get("price")
                        if price:
                            details["price"] = f"${price}"
                    if "image" in json_data:
                        img = json_data["image"]
                        if isinstance(img, list) and img:
                            details["imageUrl"] = img[0]
                        elif isinstance(img, str):
                            details["imageUrl"] = img
                    if "description" in json_data:
                        details["description"] = json_data["description"][:300]
                    if "brand" in json_data:
                        brand = json_data["brand"]
                        if isinstance(brand, dict) and "name" in brand:
                            details["supplier"] = brand["name"]
                        elif isinstance(brand, str):
                            details["supplier"] = brand
                    return details  # Return early if JSON-LD was successful
            except (json.JSONDecodeError, KeyError):
                continue

    # Fallback to regex patterns if JSON-LD extraction failed
    name_patterns = [
        r'<title[^>]*>([^<|]+?)(?:\s*[\|\-].*?)?</title>',
        r'"name"\s*:\s*"([^"]+)"',
        r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"',
        r'<h1[^>]*>([^<]+)</h1>',
    ]
    price_patterns = [
        r'"price"\s*:\s*"([0-9,]+\.?[0-9]*)"',
        r'[\$£€¥₹]\s*([0-9,]+\.?[0-9]*)',
        r'<span[^>]*class="[^"]*price[^"]*"[^>]*>[\$£€¥₹]?\s*([0-9,]+\.?[0-9]*)',
    ]
    img_patterns = [
        r'"image"\s*:\s*"([^"]+\.(?:jpg|jpeg|png|webp))"',
        r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"',
        r'<img[^>]+(?:data-lazy-)?src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']',
        r'data-src=["\']([^"\']+\.(?:jpg|jpeg|png|webp))["\']',
    ]
    supplier_patterns = [
        r'"brand"\s*:\s*\{\s*"name"\s*:\s*"([^"]+)"',
        r'<meta[^>]+name="brand"[^>]+content="([^"]+)"',
        r'brand["\s]*:?["\s]*([^"\n,]+)',
    ]
    availability_patterns = [
        r'(in\s+stock|out\s+of\s+stock|available|pre-?order|back\s*order)',
    ]

    # extract name
    for p in name_patterns:
        m = re.search(p, content, re.IGNORECASE | re.DOTALL)
        if m:
            n = html.unescape(m.group(1).strip())
            if len(n) > 3:
                details["name"] = n
                break

    # extract price
    for p in price_patterns:
        m = re.search(p, content, re.IGNORECASE)
        if m:
            val = m.group(1).replace(",", "")
            try:
                float(val)
                details["price"] = f"${val}"
                break
            except ValueError:
                continue

    # extract image
    for p in img_patterns:
        m = re.search(p, content, re.IGNORECASE)
        if m:
            img_url = m.group(1)
            if img_url:
                if not img_url.startswith("http"):
                    # Attempt to make relative URL absolute using source_url
                    if source_url and (img_url.startswith('/') or img_url.startswith('./')):
                        from urllib.parse import urljoin
                        img_url = urljoin(source_url, img_url)
                    elif source_url and not img_url.startswith('//'): # e.g., just a filename
                        from urllib.parse import urljoin
                        img_url = urljoin(source_url, img_url)
                    elif img_url.startswith('//'):
                        img_url = 'https:' + img_url
                details["imageUrl"] = img_url
                break

    # extract supplier
    for p in supplier_patterns:
        m = re.search(p, content, re.IGNORECASE)
        if m:
            details["supplier"] = m.group(1).strip()
            break

    # extract availability
    for p in availability_patterns:
        m = re.search(p, content, re.IGNORECASE)
        if m:
            text = m.group(1).lower()
            if "in stock" in text:
                details["availability"] = "In Stock"
            elif "out of stock" in text:
                details["availability"] = "Out of Stock"
            else:
                details["availability"] = text.title()
            break

    return details