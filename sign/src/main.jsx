import React from "react";
import ReactDOM from "react-dom/client";
import "./fonts.css";
import SignPage from "./SignPage.jsx";

// The link is /s/<token>. One regex is cheaper than a router for an app
// with exactly one route.
const match = window.location.pathname.match(/^\/s\/([A-Za-z0-9_-]{32,64})\/?$/);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SignPage token={match?.[1] ?? null} />
  </React.StrictMode>,
);
