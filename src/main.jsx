import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/alegreya-sc/500.css";
import "@fontsource/alegreya-sc/700.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@fontsource/alegreya-sans/700.css";
import "./style.css";
import "./theme.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(<App />);
