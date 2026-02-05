import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { QueryResult } from "@/components/QueryResult";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSearch = async (query: string) => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("valorant-query", {
        body: { query },
      });

      if (error) {
        console.error("Function error:", error);
        toast.error("Failed to process query");
        setResult({ success: false, error: error.message });
        return;
      }

      setResult(data);
    } catch (err) {
      console.error("Search error:", err);
      toast.error("Something went wrong");
      setResult({ 
        success: false, 
        error: err instanceof Error ? err.message : "An unexpected error occurred" 
      });
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
                VAL<span className="text-primary">STATS</span>
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Players
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Teams
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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
                Natural language search powered by real match data.
                <br className="hidden md:block" />
                Get accurate stats, instantly computed from our database.
              </p>
            </div>

            {/* Search */}
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />

            {/* Results */}
            <QueryResult data={result} isLoading={isLoading} />
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-8 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Powered by Lovable Cloud • Data for demonstration purposes
            </p>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground">
                Sample data includes: VCT Champions 2023-2024, Masters events
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
