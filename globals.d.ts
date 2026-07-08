// Khai báo cho side-effect CSS import (vd import('leaflet/dist/leaflet.css')).
// Next.js hỗ trợ import CSS nhưng TypeScript cần khai báo module để không báo lỗi.
declare module '*.css';
