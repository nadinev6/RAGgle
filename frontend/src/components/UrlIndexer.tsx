import React, { useState, useEffect } from 'react';
import { Button } from '@progress/kendo-react-buttons';
import { Switch } from '@progress/kendo-react-inputs';
import { ProgressBar } from '@progress/kendo-react-progressbars';
import { Tooltip } from '@progress/kendo-react-tooltip';
import { Notification, NotificationGroup } from '@progress/kendo-react-notification';
import axios from 'axios';
import './UrlIndexer.css';

interface IndexResult {
  success: boolean;
  message: string;
  document_id?: string;
  error?: string;
}

interface IndexedItem {
  url: string;
  title?: string;
  document_id?: string;
}

interface NotificationItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

// Interface for controlling the dynamic Tooltip
interface TooltipState {
  show: boolean;
  content: React.ReactNode | null;
  anchor: HTMLElement | null; // The DOM element that triggers the tooltip
}

const STORAGE_KEY = 'nuclia-indexed-urls';


const UrlIndexer: React.FC = () => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isProductPage, setIsProductPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [indexedUrls, setIndexedUrls] = useState<IndexedItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  
  // 1. NEW STATE: State to control the dynamic Tooltip
  const [tooltipState, setTooltipState] = useState<TooltipState>({
    show: false,
    content: null,
    anchor: null,
  });

  // Load indexed URLs from localStorage on component mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedUrls = JSON.parse(stored);
        if (Array.isArray(parsedUrls)) {
          setIndexedUrls(parsedUrls);
        }
      }
    } catch (error) {
      console.error('Error loading indexed URLs from localStorage:', error);
    }
  }, []); // Empty dependency array ensures this runs once on mount

  // Save indexed URLs to localStorage whenever the list changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(indexedUrls));
    } catch (error) {
      console.error('Error saving indexed URLs to localStorage:', error);
    }
  }, [indexedUrls]);

  // Handler to show the tooltip on hover
  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>, item: IndexedItem) => {
    // Construct the complex JSX content for the tooltip
    const content = (
      <div style={{ padding: '8px', maxWidth: '300px' }}>
        {item.title && (
          <div style={{ marginBottom: '4px' }}>
            <strong>Title:</strong> {item.title}
          </div>
        )}
        {item.document_id && (
          <div style={{ marginBottom: '4px' }}>
            <strong>Document ID:</strong> 
            <code style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '2px 4px', 
              borderRadius: '3px',
              fontSize: '0.85em',
              marginLeft: '4px'
            }}>
              {item.document_id}
            </code>
          </div>
        )}
        <div>
          <strong>URL:</strong> 
          <span style={{ 
            wordBreak: 'break-all', 
            fontSize: '0.9em',
            marginLeft: '4px'
          }}>
            {item.url}
          </span>
        </div>
      </div>
    );

    // Update the tooltip state to show the tooltip
    setTooltipState({
      show: true,
      content: content,
      anchor: e.currentTarget, // The 'Visit' link is the anchor
    });
  };

  // Handler to hide the tooltip on hover out
  const handleMouseLeave = () => {
    // Fully reset the tooltip state to ensure clean unmounting
    setTooltipState({
      show: false,
      content: null,
      anchor: null,
    });
  };

  // Handler to close the tooltip (for onClose prop)
  const handleTooltipClose = () => {
    setTooltipState({
      show: false,
      content: null,
      anchor: null,
    });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!url.trim()) {
      const notification: NotificationItem = {
        id: Date.now(),
        message: 'Please enter a valid URL',
        type: 'error'
      };
      setNotifications(prev => [...prev, notification]);
      
      // Removed duplicate setTimeout here
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
      
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('http://127.0.0.1:5000/index-url', {
        url: url.trim(),
        title: title.trim() || undefined,
        is_product_page: isProductPage
      });

      const data = response.data;
      
      if (data.success) {
        const newItem: IndexedItem = {
          url: url.trim(),
          title: title.trim() || undefined,
          document_id: data.document_id
        };
        setIndexedUrls(prev => [...prev, newItem]);
        setUrl('');
        setTitle('');
        setIsProductPage(false);
        
        // Success notification with document ID
        const successMessage = data.document_id 
          ? `URL indexed successfully. Document ID: ${data.document_id}`
          : data.message;
        
        const notification: NotificationItem = {
          id: Date.now(),
          message: successMessage,
          type: 'success'
        };
        setNotifications(prev => [...prev, notification]);
        
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
        }, 5000);
      } else {
        // Error notification
        const notification: NotificationItem = {
          id: Date.now(),
          message: data.message || 'Failed to index URL',
          type: 'error'
        };
        setNotifications(prev => [...prev, notification]);
        
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== notification.id));
        }, 5000);
      }
    } catch (error: any) {
      console.error('Error indexing URL:', error);
      
      const errorMessage = error.response?.data?.error || error.message || 'Failed to index URL';
      const notification: NotificationItem = {
        id: Date.now(),
        message: errorMessage,
        type: 'error'
      };
      setNotifications(prev => [...prev, notification]);
      
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    setIndexedUrls([]);
    
    const notification: NotificationItem = {
      id: Date.now(),
      message: 'History cleared successfully',
      type: 'success'
    };
    setNotifications(prev => [...prev, notification]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 3000);
  };

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="url-indexer">
      <NotificationGroup className="notification-group">
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            type={notification.type}
            closable={true}
            onClose={() => removeNotification(notification.id)}
          >
            {notification.message}
          </Notification>
        ))}
      </NotificationGroup>
      
      <form onSubmit={handleSubmit} className="indexer-form">
        {/* ... form content (url, title inputs) ... */}
        <div className="form-group">
          <label htmlFor="url">Website URL *</label>
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.alibaba.com/product-detail/..."
            className="url-input"
            disabled={loading}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="title">Custom Title (Optional)</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Custom title for this content"
            className="title-input"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <Switch
              checked={isProductPage}
              onChange={(e) => setIsProductPage(e.target.checked)}
              disabled={loading}
              className="product-switch"
            />
            <span> Product</span>
          </label>
        </div>

        <div className="form-actions">
          <Button
            type="submit"
            disabled={loading || !url.trim()}
            className="index-button"
          >
            {loading ? 'Indexing...' : 'Index URL'}
          </Button>
        </div>
        
        {loading && (
          <div className="progress-container">
            <ProgressBar 
              value={undefined}
              style={{
                background: '#f0f0f0',
                height: '16px',
                borderRadius: '4px',
                width: '100%'
              }}
            />
            <p className="progress-text">Processing URL and extracting content...</p>
          </div>
        )}
      </form>

      {indexedUrls.length > 0 && (
        <div className="indexed-history">
          <div className="history-header">
            <h3>Recently Indexed URLs ({indexedUrls.length})</h3>
            <Button onClick={handleClearHistory} className="clear-button">
              Clear History
            </Button>
          </div>
          <div className="url-list">
            {indexedUrls.map((indexedUrl, index) => (
              <div key={index} className="url-item">
                <span className="url-text">{indexedUrl.url}</span>
                
                {/* 4. ATTACH HANDLERS: Handlers attached to the link element */}
                <a 
                  href={indexedUrl.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="visit-link"
                  onMouseEnter={(e) => handleMouseEnter(e, indexedUrl)}
                  onMouseLeave={handleMouseLeave}
                >
                  Visit
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 5. CONTROLLED TOOLTIP: Render a single KendoReact Tooltip instance */}
      {tooltipState.anchor && (
        <Tooltip
          anchor={tooltipState.anchor}
          show={tooltipState.show}
          onClose={handleTooltipClose}
          content={tooltipState.content}
          position="right" // Adjust position as needed (top, bottom, left, right)
        />
      )}
    </div>
  );
};

export default UrlIndexer;