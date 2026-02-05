import { StatCard } from "./StatCard";
import { AlertCircle, Code, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface QueryResultProps {
  data: {
    success: boolean;
    query?: string;
    sql?: string;
    results?: any[];
    explanation?: string;
    error?: string;
  } | null;
  isLoading?: boolean;
}

export const QueryResult = ({ data, isLoading }: QueryResultProps) => {
  const [showSql, setShowSql] = useState(false);

  if (isLoading) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-12">
        <div className="bg-card border border-border rounded-2xl p-8 animate-shimmer">
          <div className="flex items-center justify-center gap-3">
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="text-center text-muted-foreground mt-4 font-medium">
            Crunching the numbers...
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (!data.success) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-12 animate-fade-up">
        <div className="bg-card border border-destructive/30 rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Couldn't process that query
              </h3>
              <p className="text-muted-foreground">
                {data.error || "Something went wrong. Try rephrasing your question."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const results = data.results || [];

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 space-y-6">
      {/* Main answer */}
      {data.explanation && (
        <div className="animate-fade-up bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-2xl p-6">
          <p className="text-xl font-medium text-foreground leading-relaxed">
            {data.explanation}
          </p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 ? (
        <div className="space-y-4">
          {results.slice(0, 5).map((result, index) => (
            <StatCard 
              key={index} 
              result={result} 
              rank={index + 1}
              explanation={index === 0 ? undefined : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="animate-fade-up bg-card border border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">
            No matching stats found. Try a different query.
          </p>
        </div>
      )}

      {/* SQL debug toggle */}
      {data.sql && (
        <div className="animate-fade-up">
          <button
            onClick={() => setShowSql(!showSql)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Code className="w-4 h-4" />
            <span>View generated SQL</span>
            {showSql ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {showSql && (
            <pre className="mt-3 bg-secondary rounded-xl p-4 overflow-x-auto text-sm text-muted-foreground font-mono">
              {data.sql}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
