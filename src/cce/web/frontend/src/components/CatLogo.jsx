import React from 'react';

const CatLogo = ({ className = "w-8 h-8", color = "currentColor" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    className={className}
    fill={color}
  >
    <path d="M24,40 L14,10 L38,30 L50,18 L62,30 L86,10 L76,40 L84,58 L80,80 L50,94 L20,80 L16,58 Z" />
  </svg>
);

export default CatLogo;
