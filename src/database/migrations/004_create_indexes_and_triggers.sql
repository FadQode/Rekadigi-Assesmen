CREATE INDEX idx_filter_attributes_category
    ON filter_attributes(category_id);

CREATE INDEX idx_listings_category
    ON listings(category_id);

CREATE INDEX idx_listings_status
    ON listings(status);

CREATE INDEX idx_listings_make
    ON listings(make);

CREATE INDEX idx_listings_model
    ON listings(model);

CREATE INDEX idx_listings_year
    ON listings(year);

CREATE INDEX idx_listings_price
    ON listings(price);

CREATE INDEX idx_listings_city
    ON listings(city);

CREATE INDEX idx_listings_created_cursor
    ON listings(created_at DESC, id DESC);

CREATE INDEX idx_listings_search_vector
    ON listings
    USING GIN(search_vector);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_filter_attributes_updated_at
BEFORE UPDATE ON filter_attributes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_listings_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_listings_make_trgm
    ON listings
    USING GIN (LOWER(make) gin_trgm_ops);

CREATE INDEX idx_listings_model_trgm
    ON listings
    USING GIN (LOWER(model) gin_trgm_ops);

CREATE INDEX idx_listings_city_trgm
    ON listings
    USING GIN (LOWER(city) gin_trgm_ops);