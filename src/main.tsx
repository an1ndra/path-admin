import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AuthProvider } from "./auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { RoutesPage } from "./pages/RoutesPage";
import { KeysPage } from "./pages/KeysPage";
import { ProvidersPage } from "./pages/ProvidersPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./styles.css";

const rootRoute = createRootRoute({
  component: () => (
    <AuthProvider>
      <Layout />
    </AuthProvider>
  ),
});

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: Dashboard }),
  createRoute({ getParentRoute: () => rootRoute, path: "/routes", component: RoutesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/keys", component: KeysPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/providers", component: ProvidersPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/login", component: Login }),
];

const router = createRouter({ routeTree: rootRoute.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
