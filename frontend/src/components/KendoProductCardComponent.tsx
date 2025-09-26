import React from 'react';
import { Card, CardBody, CardTitle, CardSubtitle, CardActions } from '@progress/kendo-react-layout';
import { Button } from '@progress/kendo-react-buttons';

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

interface KendoProductCardProps {
  product: ProductData;
  displayMode?: "full" | "imageOnly";
  onViewOriginal?: (url: string) => void;
}

const KendoProductCardComponent: React.FC<KendoProductCardProps> = ({ 
  product, 
  displayMode = "full",
  onViewOriginal 
}) => {
  const handleViewOriginal = () => {
    if (product.productUrl && onViewOriginal) {
      onViewOriginal(product.productUrl);
    } else if (product.productUrl) {
      window.open(product.productUrl, '_blank');
    }
  };

  // Image-only display mode
  if (displayMode === "imageOnly") {
    return (
      <Card style={{ margin: '1rem 0', maxWidth: '300px' }}>
        <CardBody>
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <img
              src={product.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image'}
              alt={product.name || 'Product Image'}
              style={{
                maxWidth: '100%',
                height: '250px',
                objectFit: 'cover',
                borderRadius: '4px'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x200?text=Image+Error';
              }}
            />
          </div>
        </CardBody>
        
        {product.productUrl && (
          <CardActions style={{ padding: '1rem', borderTop: '1px solid #e9ecef' }}>
            <Button
              onClick={handleViewOriginal}
              style={{
                backgroundColor: '#007acc',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                fontSize: '0.9rem',
                width: '100%'
              }}
            >
              View Original Product
            </Button>
          </CardActions>
        )}
      </Card>
    );
  }

  // Full display mode (existing functionality)
  return (
    <Card style={{ margin: '1rem 0', maxWidth: '400px' }}>
      <CardBody>
        {product.imageUrl && (
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <img
              src={product.imageUrl || 'https://via.placeholder.com/300x200?text=No+Image'}
              alt={product.name}
              style={{
                maxWidth: '100%',
                height: '200px',
                objectFit: 'cover',
                borderRadius: '4px'
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300x200?text=Image+Error';
              }}
            />
          </div>
        )}
        
        <CardTitle style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {product.name}
        </CardTitle>
        
        {product.price && (
          <CardSubtitle style={{ 
            fontSize: '1.1rem', 
            color: '#28a745', 
            fontWeight: 'bold',
            marginBottom: '0.5rem' 
          }}>
            {product.price}
          </CardSubtitle>
        )}
        
        {product.description && (
          <p style={{ 
            fontSize: '0.9rem', 
            color: '#666', 
            lineHeight: '1.4',
            marginBottom: '1rem'
          }}>
            {product.description.length > 150 
              ? `${product.description.substring(0, 150)}...` 
              : product.description
            }
          </p>
        )}
        
        <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '1rem' }}>
          {product.supplier && (
            <div style={{ marginBottom: '0.25rem' }}>
              <strong>Supplier:</strong> {product.supplier}
            </div>
          )}
          
          {product.availability && (
            <div style={{ marginBottom: '0.25rem' }}>
              <strong>Availability:</strong> {product.availability}
            </div>
          )}
          
          {product.category && (
            <div style={{ marginBottom: '0.25rem' }}>
              <strong>Category:</strong> {product.category}
            </div>
          )}
          
          {product.rating && (
            <div style={{ marginBottom: '0.25rem' }}>
              <strong>Rating:</strong> {product.rating}/5 ⭐
            </div>
          )}
        </div>
        
        {product.features && product.features.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.9rem', color: '#333' }}>Key Features:</strong>
            <ul style={{ 
              fontSize: '0.85rem', 
              color: '#555', 
              marginTop: '0.5rem',
              paddingLeft: '1.2rem'
            }}>
              {product.features.slice(0, 3).map((feature, index) => (
                <li key={index} style={{ marginBottom: '0.25rem' }}>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
      
      {product.productUrl && (
        <CardActions style={{ padding: '1rem', borderTop: '1px solid #e9ecef' }}>
          <Button
            onClick={handleViewOriginal}
            style={{
              backgroundColor: '#007acc',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}
          >
            View Original Product
          </Button>
        </CardActions>
      )}
    </Card>
  );
};

export default KendoProductCardComponent;