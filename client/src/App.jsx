import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import PhonePage from './components/PhonePage';
import MonitorPage from './components/MonitorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/phone" element={<PhonePage />} />
      <Route path="/monitor" element={<MonitorPage />} />
    </Routes>
  );
}
