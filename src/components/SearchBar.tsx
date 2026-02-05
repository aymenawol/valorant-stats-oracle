import { useState, useRef, useEffect } from "react";
import { Search, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

const EXAMPLE_QUERIES = [
  "highest ACS on Bind in VCT internationals",
  "most kills in a single map at Champions",
  "best K/D on Haven by duelists in playoffs",
  "aspas stats at Champions 2023",
  "TenZ performance on Jett",
];

export const SearchBar = ({ onSearch, isLoading = false, placeholder }: SearchBarProps) => {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim());
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    onSearch(example);
  };

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <form onSubmit={handleSubmit} className="relative">
        <div
          className={cn(
            "relative rounded-2xl transition-all duration-300",
            isFocused && "animate-pulse-glow"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-4 bg-card border-2 rounded-2xl px-6 py-5 transition-all duration-300",
              isFocused ? "border-primary" : "border-border hover:border-muted-foreground/30"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 text-primary animate-spin flex-shrink-0" />
            ) : (
              <Search className="w-6 h-6 text-muted-foreground flex-shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder || "Ask anything about VALORANT esports stats..."}
              className="flex-1 bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none font-medium"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!query.trim() || isLoading}
              className={cn(
                "px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200",
                query.trim() && !isLoading
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Search
            </button>
          </div>
        </div>
      </form>

      {/* Example queries */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          Try:
        </span>
        {EXAMPLE_QUERIES.slice(0, 3).map((example) => (
          <button
            key={example}
            onClick={() => handleExampleClick(example)}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors duration-200 disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
    </div>
  );
};
