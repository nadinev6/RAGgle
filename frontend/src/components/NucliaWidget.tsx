import React from 'react';
import './NucliaWidget.css';

interface NucliaConfig {
  success: boolean;
  authtoken?: string;
  knowledgebox?: string;
  zone?: string;
  error?: string;
}

interface NucliaWidgetProps {
  config: NucliaConfig | null;
  loading: boolean;
}

const NucliaWidget: React.FC<NucliaWidgetProps> = ({ config, loading }) => {
  if (loading) {
    return (
      <div className="nuclia-widget-container">
        <div className="widget-loading">
          <p>Loading chat interface...</p>
        </div>
      </div>
    );
  }

  if (!config || !config.success) {
    return (
      <div className="nuclia-widget-container">
        <div className="widget-error">
          <h4>Chat Unavailable</h4>
          <p>{config?.error || 'Failed to load configuration'}</p>
          <p>Please check your backend configuration and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nuclia-widget-container">
      <div className="widget-wrapper">
        <nuclia-chat
          audit_metadata='{"config":"nuclia-standard","widget":"e-commerce"}'
          knowledgebox={config.knowledgebox || ''}
          authtoken={config.authtoken || ''}
          zone={config.zone || 'aws-eu-central-1-1'}
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