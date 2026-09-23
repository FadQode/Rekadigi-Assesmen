CREATE TABLE filter_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category_id UUID NOT NULL
        REFERENCES categories(id)
        ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,

    slug VARCHAR(100) NOT NULL,

    type VARCHAR(20) NOT NULL,

    options JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT filter_attributes_type_check
        CHECK (type IN ('enum', 'range', 'boolean')),

    CONSTRAINT filter_attributes_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT filter_attributes_slug_not_empty
        CHECK (length(trim(slug)) > 0),

    CONSTRAINT filter_attributes_unique_slug
        UNIQUE (category_id, slug)
);
CREATE TABLE listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category_id UUID NOT NULL
        REFERENCES categories(id)
        ON DELETE RESTRICT,

    title VARCHAR(255) NOT NULL,

    description TEXT,

    make VARCHAR(100) NOT NULL,

    model VARCHAR(100) NOT NULL,

    year SMALLINT NOT NULL,

    mileage INTEGER NOT NULL DEFAULT 0,

    price NUMERIC(15,2) NOT NULL,

    condition VARCHAR(30) NOT NULL,

    transmission VARCHAR(30) NOT NULL,

    fuel_type VARCHAR(30) NOT NULL,

    color VARCHAR(50),

    city VARCHAR(100) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'available',

    images JSONB NOT NULL DEFAULT '[]'::jsonb,

    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,

    search_vector TSVECTOR,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT listings_year_check
        CHECK (year >= 1886),

    CONSTRAINT listings_mileage_check
        CHECK (mileage >= 0),

    CONSTRAINT listings_price_check
        CHECK (price >= 0),

    CONSTRAINT listings_status_check
        CHECK (
            status IN (
                'available',
                'sold',
                'pending',
                'removed'
            )
        ),

    CONSTRAINT listings_title_not_empty
        CHECK (length(trim(title)) > 0),

    CONSTRAINT listings_make_not_empty
        CHECK (length(trim(make)) > 0),

    CONSTRAINT listings_model_not_empty
        CHECK (length(trim(model)) > 0)
);