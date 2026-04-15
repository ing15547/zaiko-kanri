import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Board from "@/pages/Board";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import { loadConfig } from "@/lib/github";
import { useEffect } from "react";

function RedirectToSettings() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loadConfig()) {
      navigate("/settings");
    }
  }, []);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Layout>
          <RedirectToSettings />
          <Switch>
            <Route path="/" component={Board} />
            <Route path="/new" component={NewRequest} />
            <Route path="/edit/:id">
              {(params) => <NewRequest editId={params.id} />}
            </Route>
            <Route path="/requests/:id" component={RequestDetail} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
