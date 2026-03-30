import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { QueryResult } from "@/components/QueryResult";
import { queryStats, type QueryResponse } from "@/lib/api";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await queryStats(query);
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

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
          backgroundSize: "60px 60px",
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
                VAL<span className="text-primary">MUSE</span>
              </span>
            </div>
          </div>
        </header>

        {/* Hero section */}
        <main className="px-6 pt-12 md:pt-20 pb-20">
          <div className="max-w-7xl mx-auto">
            {/* Title */}
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-foreground mb-4 tracking-tight">
                Search{" "}
                <span className="text-primary">VALORANT</span>
                <br />
                pro stats
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                Natural language search powered by VLR.gg stats.
                <br className="hidden md:block" />
                Ask about players, agents, maps, and regions.
              </p>
            </div>

            {/* Search */}
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />

            {/* Results */}
            <QueryResult data={result} error={error} isLoading={isLoading} />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-8 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              ValMuse v1 — Data sourced from vlr.gg/stats
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
