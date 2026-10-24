create table products (id serial primary key, name text not null, price numeric not null);
create table orders (id serial primary key, items jsonb not null, total numeric not null, created_at timestamptz default now());
