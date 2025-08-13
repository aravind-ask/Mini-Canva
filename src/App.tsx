// src/App.tsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import CanvasPage from "./routes/CanvasPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/canvas/:id" element={<CanvasPage />} />
    </Routes>
  );
}
