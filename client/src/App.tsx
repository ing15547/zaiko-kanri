import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Board from "@/pages/Board";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Layout>
          <Switch>
            <Route path="/" component={Board} />
            <Route path="/new" component={NewRequest} />
            <Route path="/edit/:id">
              {(params) => <NewRequest editId={params.id} />}
            </Route>
            <Route path="/requests/:id" component={RequestDetail} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
