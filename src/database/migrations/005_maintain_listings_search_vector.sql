-- Maintain listings.search_vector automatically.
--
-- The column is declared in 003 and indexed with GIN in 004, and the README
-- states it is maintained, but nothing actually kept it current: only the seed
-- populated it with a one-off UPDATE. Two defects followed from that:
--
--   * listings created through POST /listings had search_vector = NULL and were
--     therefore invisible to full-text search;
--   * listings updated through PATCH /listings/:id kept a stale vector, so the
--     old text still matched and the new text did not.
--
-- This trigger derives the vector from the same fields the seed used, so the
-- two paths agree: title, description, make, model, color and city.
--
-- The trigger is created for INSERT and UPDATE and lists the source columns in
-- its `UPDATE OF` clause so unrelated updates (price, status, soft delete) do
-- not rebuild the vector needlessly. A partial index is not used, so the
-- `deleted_at`/`status` filters remain part of the query predicate, not the
-- index.

CREATE OR REPLACE FUNCTION listings_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_vector = to_tsvector(
        'english',
        coalesce(NEW.title, '') || ' ' ||
        coalesce(NEW.description, '') || ' ' ||
        coalesce(NEW.make, '') || ' ' ||
        coalesce(NEW.model, '') || ' ' ||
        coalesce(NEW.color, '') || ' ' ||
        coalesce(NEW.city, '')
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_listings_search_vector
BEFORE INSERT OR UPDATE OF title, description, make, model, color, city
ON listings
FOR EACH ROW
EXECUTE FUNCTION listings_search_vector_update();

-- Backfill any rows the old one-off seed update missed.
UPDATE listings
SET search_vector = to_tsvector(
    'english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(make, '') || ' ' ||
    coalesce(model, '') || ' ' ||
    coalesce(color, '') || ' ' ||
    coalesce(city, '')
)
WHERE search_vector IS NULL;
