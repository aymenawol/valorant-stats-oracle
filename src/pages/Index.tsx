import { useState, useCallback } from "react";
import { SearchBar } from "@/components/SearchBar";
import { QueryResult } from "@/components/QueryResult";
import { queryStats, type QueryResponse } from "@/lib/vlr-api";
import { toast } from "sonner";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setResult(null);
    setLastQuery(query);

    try {
      const data = await queryStats(query);
      setResult(data);
      if (!data.success && data.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error("Search error:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      const isNetworkError = message.toLowerCase().includes("failed to send") ||
        message.toLowerCase().includes("fetch") ||
        message.toLowerCase().includes("network");

      toast.error(isNetworkError
        ? "Couldn't reach the server. Retrying may help."
        : "Failed to process query");

      setResult({
        success: false,
        query,
        sql: null,
        results: [],
        columns: [],
        column_formats: {},
        explanation: "",
        count: 0,
        error: isNetworkError
          ? "The server is temporarily unavailable. Please try again."
          : message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = useCallback(() => {
    if (lastQuery) handleSearch(lastQuery);
  }, [lastQuery]);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(0_100%_60%/0.08),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(220_80%_50%/0.05),transparent_50%)]" />
      
      {/* Grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="pt-8 pb-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <span className="text-primary-foreground font-black text-lg">V</span>
              </div>
              <span className="text-xl font-bold text-foreground tracking-tight">
                VCT <span className="text-primary">STATS</span>
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a
                href="https://www.vlr.gg/stats"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                VLR.gg Stats
              </a>
              <a
                href="https://www.vlr.gg/rankings"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Rankings
              </a>
              <a
                href="https://www.vlr.gg/events"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Events
              </a>
            </nav>
          </div>
        </header>

        {/* Hero section */}
        <main className="px-6 pt-12 md:pt-20 pb-20">
          <div className="max-w-7xl mx-auto">
            {/* Title */}
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-foreground mb-4 tracking-tight">
                Ask anything about
                <br />
                <span className="text-primary">VALORANT</span> esports
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                Natural language queries powered by{" "}
                <a href="https://www.vlr.gg" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  vlr.gg
                </a>{" "}
                match data.
                <br className="hidden md:block" />
                Averages, comparisons, leaderboards — just ask.
              </p>
            </div>

            {/* Search */}
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />

            {/* Results */}
            <QueryResult
              data={result}
              isLoading={isLoading}
              onRetry={handleRetry}
            />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-8 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Data sourced from{" "}
              <a href="https://www.vlr.gg" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                vlr.gg
              </a>{" "}
              via{" "}
              <a href="https://github.com/axsddlr/vlrggapi" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                vlrggapi
              </a>
              . Not affiliated with Riot Games or vlr.gg.
            </p>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                VCT Champions, Masters, Challengers & league data
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
