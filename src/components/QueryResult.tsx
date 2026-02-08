import { AlertCircle, Code, ChevronDown, ChevronUp, RefreshCw, Database } from "lucide-react";
import { useState } from "react";
import type { QueryResponse } from "@/lib/vlr-api";
import { formatCellValue, formatColumnName } from "@/lib/vlr-api";

interface QueryResultProps {
  data: QueryResponse | null;
  isLoading?: boolean;
  onRetry?: () => void;
}

export const QueryResult = ({ data, isLoading, onRetry }: QueryResultProps) => {
  const [showSQL, setShowSQL] = useState(false);

  if (isLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto mt-12">
        <div className="bg-card border border-border rounded-2xl p-8 animate-shimmer">
          <div className="flex items-center justify-center gap-3">
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <p className="text-center text-muted-foreground mt-4 font-medium">
            Generating query and fetching results...
          </p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Error state
  if (!data.success || (data.error && data.results.length === 0)) {
    return (
      <div className="w-full max-w-5xl mx-auto mt-12 animate-fade-up">
        <div className="bg-card border border-destructive/30 rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Couldn't process that query
              </h3>
              <p className="text-muted-foreground">
                {data.explanation || data.error || "Something went wrong. Try rephrasing your question."}
              </p>
              {data.error && (
                <p className="text-sm text-muted-foreground/70 mt-2 font-mono">
                  {data.error}
                </p>
              )}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg text-sm font-medium transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { results, columns, column_formats, explanation } = data;

  return (
    <div className="w-full max-w-5xl mx-auto mt-12 space-y-6">
      {/* Explanation banner */}
      {explanation && (
        <div className="animate-fade-up bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-2xl p-6">
          <p className="text-xl font-medium text-foreground leading-relaxed">
            {explanation}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Results table */}
      {results.length > 0 ? (
        <div className="animate-fade-up bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 w-10">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                    >
                      {formatColumnName(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {rowIdx + 1}
                    </td>
                    {columns.map((col, colIdx) => {
                      const format = column_formats?.[col] || "text";
                      const value = row[col];
                      const formatted = formatCellValue(value, format);

                      // First text column (usually the name) gets bold
                      const isNameCol = colIdx === 0 && format === "text";
                      // Numeric columns get right-aligned mono font
                      const isNumeric = format === "number" || format === "decimal" || format === "percent";

                      return (
                        <td
                          key={col}
                          className={`px-4 py-3 whitespace-nowrap ${
                            isNameCol
                              ? "font-semibold text-foreground"
                              : isNumeric
                                ? "font-mono text-foreground tabular-nums"
                                : "text-muted-foreground"
                          }`}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="animate-fade-up bg-card border border-border rounded-2xl p-8 text-center">
          <Database className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-lg font-medium text-foreground mb-2">No matching data found</p>
          <p className="text-muted-foreground">
            Try broadening your search — adjust the event, player, or time range.
          </p>
        </div>
      )}

      {/* SQL debug toggle */}
      {data.sql && (
        <div className="animate-fade-up">
          <button
            onClick={() => setShowSQL(!showSQL)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Code className="w-4 h-4" />
            <span>View generated SQL</span>
            {showSQL ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showSQL && (
            <pre className="mt-3 bg-secondary rounded-xl p-4 overflow-x-auto text-sm text-muted-foreground font-mono whitespace-pre-wrap">
              {data.sql}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
