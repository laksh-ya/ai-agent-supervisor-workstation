// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Static hosting has no API server: REACT_APP_DATA_SOURCE=browser answers every request in the page.
const ready = process.env.REACT_APP_DATA_SOURCE === 'browser'
  ? import('./local').then((local) => local.install())
  : Promise.resolve();

ready.then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
