import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Input, Switch } from '@progress/kendo-react-inputs';
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

interface AskResponse {
  success: boolean;
  query: string;
  answer: string;
  structured_data?: {
    products?: ProductData[];
    summary?: string;
  };
  citations?: any[];
  error?: string;
}
const NucliaWidget: React.FC = () => {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<NucliaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);

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

  const handleAskQuestion = async () => {
    if (!userQuery.trim()) return;

    setAskLoading(true);
    setAskResponse(null);

    try {
      const response = await axios.post('http://127.0.0.1:5000/ask-product-details', {
        query: userQuery.trim()
      });

      const data = response.data;
      setAskResponse(data);
      
      if (data.success) {
        console.log('Structured data received:', data.structured_data);
      }
    } catch (error: any) {
      console.error('Error asking question:', error);
      setAskResponse({
        success: false,
        query: userQuery,
        answer: '',
        error: error.response?.data?.error || error.message
      });
    } finally {
      setAskLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
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
      {/* AI-Powered Product Query Section */}
      <div className="ai-query-section" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: '#333' }}>Ask About Your Products</h3>
        
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Input
            onChange={(e) => setUserQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about products (e.g., 'Show me all books by Stephen King', 'Find electronics under $100')"
            className="ai-query-input"
            disabled={askLoading}
          />
          <Button
            onClick={handleAskQuestion}
            disabled={askLoading || !userQuery.trim()}
            className="ai-query-button"
          >
            {askLoading ? 'Asking...' : 'Ask AI'}
          </Button>
        </div>
        
        {/* Display AI Response */}
        {askResponse && (
          <div style={{ marginTop: '1.5rem' }}>
            {askResponse.success ? (
              <div>
                {askResponse.structured_data?.summary && (
                  <div style={{ 
                    padding: '1rem', 
                    backgroundColor: '#f0f8ff', 
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    border: '1px solid #007acc'
                  }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#007acc' }}>Summary</h4>
                    <p style={{ margin: 0, color: '#333' }}>{askResponse.structured_data.summary}</p>
                  </div>
                )}
                
                {askResponse.structured_data?.products && askResponse.structured_data.products.length > 0 ? (
                  <div>
                    <h4 style={{ marginBottom: '1rem', color: '#333' }}>
                      Found {askResponse.structured_data.products.length} Product(s)
                    </h4>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
                      gap: '1rem' 
                    }}>
                      {askResponse.structured_data.products.map((product, index) => (
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
                      {askResponse.answer || 'No structured product data found for your query.'}
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
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#721c24' }}>Error</h4>
                <p style={{ margin: 0, color: '#721c24' }}>
                  {askResponse.error || 'Failed to process your question.'}
                </p>
              </div>
            )}
          </div>
        )}
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
            <li>"What products do we have from Supplier X?"</li>
            <li>"Show me all books by [author name]"</li>
            <li>"Which suppliers provide the most products?"</li>
            <li>"Find products in [category] under $50"</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NucliaWidget;