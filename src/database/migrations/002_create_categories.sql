CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    parent_id UUID REFERENCES categories(id)
        ON DELETE RESTRICT,

    name VARCHAR(100) NOT NULL,

    slug VARCHAR(100) NOT NULL,

    path TEXT NOT NULL,

    depth INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT categories_depth_non_negative
        CHECK (depth >= 0),

    CONSTRAINT categories_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT categories_slug_not_empty
        CHECK (length(trim(slug)) > 0),

    CONSTRAINT categories_parent_slug_unique
        UNIQUE (parent_id, slug)
);
CREATE INDEX idx_categories_parent_id
    ON categories(parent_id);

CREATE INDEX idx_categories_path
    ON categories(path text_pattern_ops);

CREATE UNIQUE INDEX uq_categories_root_slug
    ON categories(slug)
    WHERE parent_id IS NULL;