import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Input } from '@progress/kendo-react-inputs';
import { DatePicker } from '@progress/kendo-react-dateinputs';
import axios from 'axios';
import KendoProductCardComponent from './KendoProductCardComponent.tsx'; 
import './NucliaWidget.css';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'nuclia-chat': any;
    }
  }
}

interface NucliaConfig {
  success: boolean;
  authtoken?: string;
  knowledgebox?: string;
  zone?: string;
  error?: string;
}

interface ProductData {
  name: string;
  price?: string;
  description?: string;
  supplier?: string;
  availability?: string;
  imageUrl?: string;
  productUrl?: string;
  category?: string;
  rating?: number;
  features?: string[];
}

interface SearchResponse {
  success: boolean;
  query?: string;
  summary?: string;
  structured_data?: {
    products?: ProductData[];
  };
  error?: string;
}

const NucliaWidget: React.FC = () => {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<NucliaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);

  useEffect(() => {
    // Fetch Nuclia configuration from backend
    const fetchConfig = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:5000/nuclia-config');
        const configData = response.data;
        
        if (configData.success) {
          setConfig(configData);
        } else {
          setError(configData.error || 'Failed to load configuration');
        }
      } catch (err: any) {
        console.error('Error fetching Nuclia config:', err);
        setError(err.response?.data?.error || err.message || 'Failed to connect to backend');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  useEffect(() => {
    if (!config || !config.success) return;

    // Load the Nuclia widget script
    const script = document.createElement('script');
    script.src = 'https://cdn.rag.progress.cloud/nuclia-widget.umd.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    
    script.onload = () => {
      console.log('Nuclia widget script loaded successfully');
      // Attributes are now set directly via JSX props, no need for setAttribute here.
    };
    
    script.onerror = () => {
      console.error('Failed to load Nuclia widget script');
      setError('Failed to load chat widget');
    };
    
    document.head.appendChild(script);
    
    return () => {
      // Cleanup: remove script when component unmounts
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [config]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchResults(null);

    try {
      const payload: any = {
        query: searchQuery.trim()
      };
      
      if (fromDate) {
        payload.fromDate = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
      
      if (toDate) {
        payload.toDate = toDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      }

      const response = await axios.post('http://127.0.0.1:5000/search-products', payload);

      const data = response.data;
      setSearchResults(data);
      
      if (data.success) {
        console.log('Search results received:', data.structured_data);
      }
    } catch (error: any) {
      console.error('Error searching products:', error);
      setSearchResults({
        success: false,
        error: error.response?.data?.error || error.message
      });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const clearDates = () => {
    setFromDate(null);
    setToDate(null);
  };

  const setDateRange = (days: number) => {
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - days);
    
    setFromDate(pastDate);
    setToDate(today);
  };

  if (loading) {
    return (
      <div className="nuclia-widget-container">
        <div className="widget-loading">
          <p>Loading chat interface...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="nuclia-widget-container">
        <div className="widget-error">
          <h4>Chat Unavailable</h4>
          <p>{error}</p>
          <p>Please check your backend configuration and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nuclia-widget-container">
      {/* Date-Filtered Product Search Section */}
      <div className="search-section" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Search Your Indexed Products</h3>
        
        {/* Search Query Input */}
        <div style={{ marginBottom: '1rem' }}>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search for products (e.g., 'books by Stephen King', 'electronics under $100')"
            style={{ width: '100%' }}
            disabled={searchLoading}
          />
        </div>
        
        {/* Date Range Filters */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          alignItems: 'center', 
          marginBottom: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', color: '#666' }}>From:</label>
            <DatePicker
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={searchLoading}
              style={{ width: '140px' }}
            />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.9rem', color: '#666' }}>To:</label>
            <DatePicker
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={searchLoading}
              style={{ width: '140px' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              onClick={() => setDateRange(7)}
              disabled={searchLoading}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.4rem 0.8rem',
                backgroundColor: '#f5f5f5',
                color: '#666',
                border: '1px solid #ddd'
              }}
            >
              Last 7 days
            </Button>
            <Button
              onClick={() => setDateRange(30)}
              disabled={searchLoading}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.4rem 0.8rem',
                backgroundColor: '#f5f5f5',
                color: '#666',
                border: '1px solid #ddd'
              }}
            >
              Last 30 days
            </Button>
            <Button
              onClick={clearDates}
              disabled={searchLoading}
              style={{ 
                fontSize: '0.8rem', 
                padding: '0.4rem 0.8rem',
                backgroundColor: '#f5f5f5',
                color: '#666',
                border: '1px solid #ddd'
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        
        {/* Search Button */}
        <div style={{ marginBottom: '1rem' }}>
          <Button
            onClick={handleSearch}
            disabled={searchLoading || !searchQuery.trim()}
            style={{
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              padding: '0.75rem 2rem',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: '600'
            }}
          >
            {searchLoading ? 'Searching...' : 'Search Products'}
          </Button>
        </div>
        
        {/* Display Search Results */}
        {searchResults && (
          <div style={{ marginTop: '1.5rem' }}>
            {searchResults.success ? (
              <div>
                {searchResults.summary && (
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: '#f0f8ff', 
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    border: '1px solid #007acc'
                  }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#007acc' }}>Search Summary</h4>
                    <p style={{ margin: 0, color: '#333' }}>{searchResults.summary}</p>
                  </div>
                )}
                
                {searchResults.structured_data?.products && searchResults.structured_data.products.length > 0 ? (
                  <div>
                    <h4 style={{ marginBottom: '1rem', color: '#333' }}>
                      Found {searchResults.structured_data.products.length} Product(s)
                      {(fromDate || toDate) && (
                        <span style={{ fontSize: '0.9rem', color: '#666', fontWeight: 'normal' }}>
                          {' '}indexed between {fromDate ? fromDate.toLocaleDateString() : 'beginning'} and {toDate ? toDate.toLocaleDateString() : 'now'}
                        </span>
                      )}
                    </h4>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
                      gap: '1rem' 
                    }}>
                      {searchResults.structured_data.products.map((product, index) => (
                        <KendoProductCardComponent
                          key={index}
                          product={product}
                          displayMode="full"
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: '#fff3cd', 
                    borderRadius: '6px',
                    border: '1px solid #ffc107'
                  }}>
                    <p style={{ margin: 0, color: '#856404' }}>
                      No products found for your search criteria.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#f8d7da', 
                borderRadius: '6px',
                border: '1px solid #dc3545'
              }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#721c24' }}>Search Error</h4>
                <p style={{ margin: 0, color: '#721c24' }}>
                  {searchResults.error || 'Failed to search products.'}
                </p>
              </div>
            )}
          </div>
        )}
      }
      </div>

      <div className="widget-wrapper" ref={widgetRef}>
        <nuclia-chat
          audit_metadata='{"config":"nuclia-standard","widget":"e-commerce"}'
          knowledgebox={config?.knowledgebox || ''}
          authtoken={config?.authtoken || ''}
          zone={config?.zone || 'aws-eu-central-1-1'}
          features="answers,rephrase,suggestions,autocompleteFromNERs,citations,hideResults,permalink,displaySearchButton,navigateToLink,navigateToFile,navigateToOriginURL,openNewTab,persistChatHistory"
          rag_strategies="neighbouring_paragraphs|2|2"
          feedback="none"
        />
      </div>
      
      <div className="widget-info">
        <h3>Chat Features</h3>
        <ul>
          <li>Use the AI query section above for structured product results</li>
          <li>Use the chat widget below for conversational interactions</li>
          <li>Both interfaces access your indexed product data</li>
          <li>Natural language queries supported in both modes</li>
        </ul>
        
        <div className="example-queries">
          <h4>Try asking:</h4>
          <ul>
            <li>"books by Stephen King"</li>
            <li>"electronics under $100"</li>
            <li>"products from Barnes & Noble"</li>
            <li>"wireless headphones"</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NucliaWidget;