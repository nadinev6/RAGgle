@app.route('/compare-products', methods=['POST'])
def compare_products():
    """
    Compare multiple products stored in Supabase, either by Supabase `id` or Nuclia `nuclia_document_id`.

    Expected JSON payload (must include at least one of the keys):
    {
        "product_ids": [1, 2, 3],   // Supabase integer IDs
        "nuclia_document_ids": ["doc-abc123", "doc-def456"]  // Nuclia resource IDs
    }

    Returns a comparison-friendly JSON where products are aligned by key attributes.
    """
    try:
        if not supabase:
            return jsonify({
                "success": False,
                "error": "Supabase not configured"
            }), 500

        data = request.get_json()
        if not data or ("product_ids" not in data and "nuclia_document_ids" not in data):
            return jsonify({
                "success": False,
                "error": "Missing 'product_ids' or 'nuclia_document_ids' in request body"
            }), 400

        product_ids = data.get("product_ids", [])
        nuclia_doc_ids = data.get("nuclia_document_ids", [])

        if not (product_ids or nuclia_doc_ids):
            return jsonify({
                "success": False,
                "error": "Both 'product_ids' and 'nuclia_document_ids' are empty"
            }), 400

        # Query Supabase for product records
        query = supabase.table("products").select("*")
        
        if product_ids and nuclia_doc_ids:
            query = query.or_(
                f"id.in.({','.join(map(str, product_ids))}),nuclia_document_id.in.({','.join(nuclia_doc_ids)})"
            )
        elif product_ids:
            query = query.in_("id", product_ids)
        elif nuclia_doc_ids:
            query = query.in_("nuclia_document_id", nuclia_doc_ids)

        query_result = query.execute()

        if not query_result or not query_result.data:
            return jsonify({
                "success": False,
                "error": "No matching products found",
                "products": []
            }), 404

        products = query_result.data

        # Define key attributes for comparison
        attributes_to_compare = [
            "name", "price_text", "supplier", "availability",
            "description", "product_url", "image_url"
        ]

        # Build comparison matrix
        comparison_attributes = {attr: [] for attr in attributes_to_compare}

        for product in products:
            for attr in attributes_to_compare:
                comparison_attributes[attr].append(product.get(attr, "N/A"))

        return jsonify({
            "success": True,
            "products": products,
            "comparison_attributes": comparison_attributes,
            "total": len(products)
        })

    except Exception as e:
        logger.error(f"Error in compare_products endpoint: {str(e)}")
        return jsonify({
            "success": False,
            "error": f"Internal server error: {str(e)}"
        }), 500