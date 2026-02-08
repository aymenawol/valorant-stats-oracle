-- Fix: LIMIT detection regex was failing, causing double LIMIT syntax errors.
-- Replace \b word boundary with simpler pattern matching.

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
  IF normalized ~* '(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|pg_sleep|pg_terminate|pg_cancel)' THEN
    RAISE EXCEPTION 'Query contains disallowed operations';
  END IF;

  -- Block writes via INTO
  IF normalized LIKE '%into %' AND normalized NOT LIKE '%into result%' AND normalized NOT LIKE '%into _%' THEN
    RAISE EXCEPTION 'SELECT INTO is not allowed';
  END IF;

  -- Auto-append LIMIT 25 if no LIMIT present (use simple LIKE check)
  IF normalized NOT LIKE '%limit %' THEN
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

GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text) TO authenticated, anon, service_role;
