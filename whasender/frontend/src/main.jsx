import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1a1d27',
          color: '#e8edf5',
          border: '1px solid #242a3d',
          borderRadius: '10px',
          fontFamily: "'Inter', sans-serif",
          fontSize: '14px',
        },
        success: {
          iconTheme: { primary: '#25d366', secondary: '#fff' },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#fff' },
        },
      }}
    />
  </React.StrictMode>
);
