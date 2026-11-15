-- Import from Shopify / WooCommerce (edge function catalog-import): products keep the shop's photo.
alter table public.products add column if not exists image_url text
  check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 1000));
