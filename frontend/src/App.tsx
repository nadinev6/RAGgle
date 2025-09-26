import React, { useState, useRef } from 'react';
import '@progress/kendo-theme-default/dist/all.css';
import './App.css';
import UrlIndexer from './components/UrlIndexer.tsx';
import NucliaWidget from './components/NucliaWidget.tsx';
import { TabStrip, TabStripTab } from '@progress/kendo-react-layout';
import { Popup } from '@progress/kendo-react-popup';
import { Icon } from '@progress/kendo-react-common'; 
import { ReactComponent as Logo } from './assets/logo.svg';
import { FaSpider , FaComments } from 'react-icons/fa';


function App() {
  const [selectedWidget, setSelectedWidget] = useState<number>(0);
  const [showDatePopover, setShowDatePopover] = useState(false);
  const dateAnchor = useRef<HTMLSpanElement>(null);

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
        <Icon className="animated-icon-holder">
          <FaSpider />
        </Icon>
        <Icon className="animated-icon-holder">
          <FaComments />
        </Icon>
      </h2>

        <TabStrip selected={selectedWidget} onSelect={handleTabSelect}>
          <TabStripTab title="Index URLs">
            <div>
              <UrlIndexer key="index" />
            </div>
          </TabStripTab>
          <TabStripTab title="Chat">
            <div>
              <NucliaWidget key="widget" />
            </div>
          </TabStripTab>
        </TabStrip>
      </div>
    </div>
  );
}

export default App;