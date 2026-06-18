import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import Layout from "./components/Layout";
import CrosspostPage from "./pages/CrosspostPage";
import InboxPage from "./pages/InboxPage";
import AccountsPage from "./pages/AccountsPage";
import SettingsPage from "./pages/SettingsPage";
import LicensePage from "./pages/LicensePage";

import "./index.css";

const router = createHashRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <CrosspostPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "license", element: <LicensePage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#1e1e2e",
          color: "#cdd6f4",
          border: "1px solid #313244",
        },
      }}
    />
  </React.StrictMode>
);
