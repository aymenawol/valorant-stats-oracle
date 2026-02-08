-- V3: Add execute_readonly_query function for LLM-generated SQL execution
-- This enables the NL → SQL approach: the LLM generates a SELECT query,
-- and this function safely executes it with guardrails.

CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '8000'
SET lock_timeout = '3000'
AS $$
DECLARE
  result jsonb;
  normalized text;
BEGIN
  -- Normalize whitespace for validation
  normalized := btrim(regexp_replace(lower(query_text), '\s+', ' ', 'g'));

  -- Must start with SELECT or WITH (CTE)
  IF NOT (normalized ~ '^(select|with)\s') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Block dangerous SQL keywords/patterns
  IF normalized ~ '\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|pg_sleep|pg_terminate|pg_cancel|set\s+role|set\s+session)\b' THEN
    RAISE EXCEPTION 'Query contains disallowed operations';
  END IF;

  -- Block writes via INTO
  IF normalized ~ '\binto\s+[a-z]' AND NOT (normalized ~ '\binto\s+(result|_)') THEN
    RAISE EXCEPTION 'SELECT INTO is not allowed';
  END IF;

  -- Auto-append LIMIT 25 if no LIMIT present
  IF NOT (normalized ~ '\blimit\s+\d') THEN
    query_text := query_text || ' LIMIT 25';
  END IF;

  -- Execute and convert to JSON array
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(row_to_json(subq)), ''[]''::jsonb) FROM (%s) subq',
    query_text
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execute to all roles used by edge functions
GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text) TO authenticated, anon, service_role;
