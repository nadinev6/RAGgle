import React, { useState, useRef } from 'react';
import axios from 'axios';
import '@progress/kendo-theme-default/dist/all.css';
import './App.css';
import UrlIndexer from './components/UrlIndexer.tsx';
import NucliaWidget from './components/NucliaWidget.tsx';
import { TabStrip, TabStripTab } from '@progress/kendo-react-layout';
import { Popup } from '@progress/kendo-react-popup';
import { Icon } from '@progress/kendo-react-common'; 
import { ReactComponent as Logo } from './assets/logo.svg';
import { FaComments } from 'react-icons/fa';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'nuclia-chat': any;
      'nuclia-popup': any;
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


function App() {
  const [selectedWidget, setSelectedWidget] = useState<number>(0);
  const [showDatePopover, setShowDatePopover] = useState(false);
  const [nucliaConfig, setNucliaConfig] = useState<NucliaConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const dateAnchor = useRef<HTMLSpanElement>(null);

  // Fetch Nuclia configuration on component mount
  React.useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:5000/nuclia-config');
        const configData = response.data;
        
        if (configData.success) {
          setNucliaConfig(configData);
        } else {
          console.error('Failed to load Nuclia configuration:', configData.error);
          setNucliaConfig({ success: false, error: configData.error || 'Failed to load configuration' });
        }
      } catch (err: any) {
        console.error('Error fetching Nuclia config:', err);
        setNucliaConfig({ 
          success: false, 
          error: err.response?.data?.error || err.message || 'Failed to connect to backend' 
        });
      } finally {
        setConfigLoading(false);
      }
    };

    fetchConfig();
  }, []);

  // Load Nuclia widget script once configuration is available
  React.useEffect(() => {
    if (!nucliaConfig || !nucliaConfig.success) return;

    // Check if script is already loaded
    if (document.querySelector('script[src="https://cdn.rag.progress.cloud/nuclia-widget.umd.js"]')) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.rag.progress.cloud/nuclia-widget.umd.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    
    script.onload = () => {
      console.log('Nuclia widget script loaded successfully');
    };
    
    script.onerror = () => {
      console.error('Failed to load Nuclia widget script');
    };
    
    document.head.appendChild(script);
    
    return () => {
      // Cleanup: remove script when component unmounts
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [nucliaConfig]);

  const handleTabSelect = (e: any) => {
    setSelectedWidget(e.selected);
  };

  const toggleDatePopover = () => {
    setShowDatePopover(!showDatePopover);
  };

  return (
    <div className="app-container">
      <header className="app-header-minimal">
        <Logo className="app-logo" />
        <div className="header-title-container">
          <h1 className="header-title"></h1>
        </div>
        <div className="header-date-container">
          <span 
            className="date-trigger" 
            onClick={toggleDatePopover}
            ref={dateAnchor}
          >
            Today
          </span>
          <Popup
            anchor={dateAnchor.current}
            show={showDatePopover}
            onClose={() => setShowDatePopover(false)}
          >
            <div className="date-popover-content">
              <strong>Today's Date:</strong>
              <br />
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </div>
          </Popup>
        </div>
      </header>

      <div className="tab-selector">
      <h2 className="app-title">
        <div 
          className="animated-icon-holder"
          data-nuclia="search-widget-button"
          style={{ cursor: 'pointer' }}
        >
          <Icon>
          <FaComments />
          </Icon>
          <span style={{ marginLeft: '8px', fontSize: '16px', fontWeight: '500' }}>
            Search
          </span>
        </div>
      </h2>

        <TabStrip selected={selectedWidget} onSelect={handleTabSelect}>
          <TabStripTab title="Index URLs">
            <div>
              <UrlIndexer key="index" />
            </div>
          </TabStripTab>
          <TabStripTab title="Chat">
            <div>
              <NucliaWidget 
                key="widget" 
                config={nucliaConfig} 
                loading={configLoading} 
              />
            </div>
          </TabStripTab>
        </TabStrip>
      </div>
      
      {/* Nuclia Search Popup */}
      {nucliaConfig && nucliaConfig.success && (
        <nuclia-popup
          audit_metadata='{"config":"RAGgle","widget":"ragle-20"}'
          knowledgebox={nucliaConfig.knowledgebox || ''}
          authtoken={nucliaConfig.authtoken || ''}
          zone={nucliaConfig.zone || 'aws-eu-central-1-1'}
          features="answers,contextImages,rephrase,filter,suggestions,autocompleteFromNERs,citations,hideResults,displayMetadata,relations,navigateToLink,noChatHistory"
          filters="labels"
          rag_strategies="neighbouring_paragraphs|2|2"
          rag_images_strategies="page_image|2"
          generativemodel="chatgpt-azure-4o"
          citation_threshold="0.4"
          feedback="none"
        />
      )}
    </div>
  );
}

export default App;