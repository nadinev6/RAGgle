import React, { useEffect, useRef, useState } from 'react';
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

const NucliaWidget: React.FC = () => {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<NucliaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          <li>Use the chat widget for conversational interactions</li>
          <li>The chat accesses your indexed product data</li>
          <li>Natural language queries supported in both modes</li>
        </ul>
        
        <div className="example-queries">
          <h4>Try asking:</h4>
          <ul>
            <li>"books by Stephen King"</li>
            <li>"electronics under $100"</li>
            <li>"products from Barnes & Noble"</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NucliaWidget;