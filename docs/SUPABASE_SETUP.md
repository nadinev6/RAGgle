# Supabase Database Schema Setup

After setting up your Supabase project and adding the environment variables, you need to create the database schema for product storage and price tracking.

## Step 1: Access Supabase SQL Editor

1. Go to your [Supabase dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to the "SQL Editor" tab in the left sidebar
4. Click "New Query" to create a new SQL script

## Step 2: Create the Products Table

Copy and paste the following SQL command to create the `products` table:

```sql
-- Create products table for storing indexed product information
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  nuclia_document_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Unknown Product',
  price_text TEXT DEFAULT 'Price not available',
  image_url TEXT DEFAULT '',
  description TEXT DEFAULT '',
  supplier TEXT DEFAULT 'Unknown Supplier',
  availability TEXT DEFAULT 'Unknown',
  product_url TEXT DEFAULT '',
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  product_type TEXT DEFAULT 'generic', -- New column
  has_metadata BOOLEAN DEFAULT FALSE -- New column
);


-- Create index on nuclia_document_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_nuclia_document_id ON products(nuclia_document_id);

-- Create index on supplier for filtering
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier);

-- Create index on indexed_at for date-based queries
CREATE INDEX IF NOT EXISTS idx_products_indexed_at ON products(indexed_at);
```

## Step 3: Create the Price History Table

Copy and paste the following SQL command to create the `price_history` table:

```sql
-- Create price_history table for tracking price changes over time
CREATE TABLE IF NOT EXISTS price_history (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'indexing',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on product_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_history_product_id ON price_history(product_id);

-- Create index on recorded_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at);

-- Create composite index for product price trends
CREATE INDEX IF NOT EXISTS idx_price_history_product_time ON price_history(product_id, recorded_at DESC);
```

## Step 4: Enable Row Level Security (Optional but Recommended)

For production use, enable Row Level Security:

```sql
-- Enable Row Level Security on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Enable Row Level Security on price_history table
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access to all users (adjust as needed)
CREATE POLICY "Allow read access to products" ON products
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to price_history" ON price_history
  FOR SELECT USING (true);

-- Create policy to allow insert/update for service role (backend operations)
CREATE POLICY "Allow backend operations on products" ON products
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow backend operations on price_history" ON price_history
  FOR ALL USING (auth.role() = 'service_role');
```

## Step 5: Run the SQL Commands

1. Click the "Run" button (or press Ctrl+Enter) to execute each SQL block
2. Verify that the tables were created successfully by checking the "Table Editor" tab
3. You should see both `products` and `price_history` tables listed

## Step 6: Verify the Setup

You can verify your schema by running this query:

```sql
-- Check if tables exist and view their structure
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('products', 'price_history')
ORDER BY table_name, ordinal_position;
```

## Database Schema Overview

### Products Table
- **id**: Primary key (auto-incrementing)
- **nuclia_document_id**: Unique identifier linking to Nuclia documents
- **name**: Product name extracted from content
- **price_text**: Raw price text as extracted
- **image_url**: Product image URL
- **description**: Product description
- **supplier**: Supplier/brand name
- **availability**: Stock status (In Stock, Out of Stock, etc.)
- **product_url**: Original product page URL
- **indexed_at**: When the product was first indexed
- **last_updated**: When the product was last updated
- **created_at**: Database record creation timestamp
- **product_type**: Type of extraction used ('bn' for Barnes & Noble, 'generic' for others)
- **has_metadata**: Boolean indicating if product details were successfully extracted

### Price History Table
- **id**: Primary key (auto-incrementing)
- **product_id**: Foreign key reference to products table
- **price**: Numeric price value
- **currency**: Price currency (default: USD)
- **recorded_at**: When this price was recorded
- **source**: Source of the price data (indexing, manual, etc.)
- **created_at**: Database record creation timestamp

## Important Notes

- The backend will automatically populate these tables when you index URLs through the application
- Each indexed product will create a record in the `products` table
- If a price is detected during indexing, it will also create an entry in the `price_history` table
- The `nuclia_document_id` serves as the bridge between your Supabase data and Nuclia's knowledge base
- Indexes are created for optimal query performance on common search patterns

## Troubleshooting

If you encounter issues:

1. **Permission Errors**: Ensure your Supabase anon key has the necessary permissions
2. **Connection Issues**: Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your `.env` file
3. **Table Creation Errors**: Check the SQL Editor for any syntax errors or conflicts
4. **RLS Issues**: If using Row Level Security, ensure your policies allow the operations your application needs

For additional help, refer to the [Supabase Documentation](https://supabase.com/docs) or check the application logs for specific error messages.