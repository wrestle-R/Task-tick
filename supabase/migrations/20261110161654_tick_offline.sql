begin;
create schema if not exists tick_private;
revoke all on schema tick_private from public, anon;
grant usage on schema tick_private to authenticated;
create sequence tick_private.revision_seq;

create table public."code-todo" (
  id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null, deleted_at timestamptz, updated_at timestamptz not null default now(),
  revision bigint not null default nextval('tick_private.revision_seq'),
  primary key(user_id,id), check(jsonb_typeof(data)='object')
);
create table public."movies-todo" (like public."code-todo" including all);
alter table public."movies-todo" add foreign key(user_id) references auth.users(id) on delete cascade;
create unique index tick_movie_identity on public."movies-todo"(user_id,(data->>'mediaType'),(data->>'tmdbId')) where deleted_at is null and data->>'tmdbId' is not null;
create index tick_todo_changes on public."code-todo"(user_id,revision);
create index tick_movie_changes on public."movies-todo"(user_id,revision);
alter table public."code-todo" enable row level security;
alter table public."movies-todo" enable row level security;
create policy tick_todo_owner on public."code-todo" for select to authenticated using ((select auth.uid())=user_id);
create policy tick_movie_owner on public."movies-todo" for select to authenticated using ((select auth.uid())=user_id);
revoke all on public."code-todo",public."movies-todo" from anon, authenticated;
grant select on public."code-todo",public."movies-todo" to authenticated;

create table tick_private.operations(user_id uuid not null references auth.users(id) on delete cascade,id uuid not null,payload jsonb not null,accepted_at timestamptz not null default now(),primary key(user_id,id));
create table tick_private.history(user_id uuid not null references auth.users(id) on delete cascade,id uuid not null default gen_random_uuid(),item jsonb not null,at timestamptz not null default now(),primary key(user_id,id));
create index tick_history_owner_time on tick_private.history(user_id,at);
alter table tick_private.operations enable row level security;
alter table tick_private.history enable row level security;
revoke all on tick_private.operations,tick_private.history from public,anon,authenticated;

-- Privileged implementation is non-exposed. Authentication/ownership is mandatory;
-- clients have no direct write grant, so every write passes protocol validation.
create function tick_private.sync(mutations jsonb,after_cursor bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); m jsonb; old record; child record; patch jsonb; merged jsonb;
 tbl text; entity uuid; op uuid; action text; kind text; key text; value jsonb;
 accepted jsonb:='[]'; result jsonb; hist jsonb; cursor_value bigint; parent jsonb;
 base jsonb:='{"title":"","done":false,"notes":"","priority":0,"dueAt":null,"parentId":null,"position":0,"rating":null,"mediaType":null,"tmdbId":null,"poster":null}';
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(mutations)<>'array' or jsonb_array_length(mutations)>100 or after_cursor<0 or octet_length(mutations::text)>1000000 then raise exception 'Invalid sync request';end if;
 -- Serialize a user's commits and pulls. Device clocks never determine order.
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 for m in select * from jsonb_array_elements(mutations) loop
  op:=(m->>'id')::uuid;entity:=(m->>'itemId')::uuid;kind:=m->>'kind';action:=m->>'action';patch:=m->'patch';
  if op is null or entity is null or kind is null or action is null or patch is null or kind not in('todo','movie') or action not in('patch','delete','restore') or jsonb_typeof(patch)<>'object' then raise exception 'Invalid mutation';end if;
  if exists(select 1 from tick_private.operations o where o.user_id=uid and o.id=op) then
   if not exists(select 1 from tick_private.operations o where o.user_id=uid and o.id=op and o.payload=m) then raise exception 'Mutation ID reused with different content';end if;
   accepted:=accepted||jsonb_build_array(op);continue;
  end if;
  for key,value in select * from jsonb_each(patch) loop
   if key not in('title','done','notes','priority','dueAt','parentId','position','rating','mediaType','tmdbId','poster') then raise exception 'Unsupported field';end if;
   if key in('title','notes') and (jsonb_typeof(value)<>'string' or length(value#>>'{}')>case when key='title' then 500 else 20000 end) then raise exception 'Invalid text';end if;
   if key='title' and length(btrim(value#>>'{}'))=0 then raise exception 'Title required';end if;
   if key='done' and jsonb_typeof(value)<>'boolean' then raise exception 'Invalid completion';end if;
   if key='priority' and (jsonb_typeof(value)<>'number' or (value#>>'{}')::numeric not in(0,1,2,3)) then raise exception 'Invalid priority';end if;
   if key='position' and jsonb_typeof(value)<>'number' then raise exception 'Invalid order';end if;
   if key='rating' and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or (value#>>'{}')::numeric<1 or (value#>>'{}')::numeric>5 or mod((value#>>'{}')::numeric*2,1)<>0) then raise exception 'Invalid rating';end if;
   if key='mediaType' and value<>'null'::jsonb and value#>>'{}' not in('movie','tv') then raise exception 'Invalid media type';end if;
   if key='tmdbId' and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or (value#>>'{}')::numeric<=0 or mod((value#>>'{}')::numeric,1)<>0) then raise exception 'Invalid provider ID';end if;
   if key='poster' and value<>'null'::jsonb and (value#>>'{}') !~ '^/[a-zA-Z0-9._-]+$' then raise exception 'Invalid poster';end if;
   if key='dueAt' and value<>'null'::jsonb then perform (value#>>'{}')::timestamptz;end if;
   if key='parentId' and value<>'null'::jsonb then perform (value#>>'{}')::uuid;end if;
  end loop;
  tbl:=case when kind='todo' then 'code-todo' else 'movies-todo' end;
  execute format('select * from public.%I where user_id=$1 and id=$2',tbl) into old using uid,entity;
  if old.id is not null then
   insert into tick_private.history(user_id,item) values(uid,old.data||jsonb_build_object('id',entity,'kind',kind,'deletedAt',old.deleted_at,'updatedAt',old.updated_at));
   if old.deleted_at is not null and action='patch' then
    insert into tick_private.history(user_id,item) values(uid,old.data||patch||jsonb_build_object('id',entity,'kind',kind,'deletedAt',null,'updatedAt',now()));
    insert into tick_private.operations values(uid,op,m,now());accepted:=accepted||jsonb_build_array(op);continue;
   end if;
  elsif action<>'patch' then
   insert into tick_private.operations values(uid,op,m,now());accepted:=accepted||jsonb_build_array(op);continue;
  end if;
  merged:=base||coalesce(old.data,'{}')||patch;
  if length(btrim(merged->>'title'))=0 then raise exception 'Title required';end if;
  if merged->>'parentId' is not null then
   if kind<>'todo' or (merged->>'parentId')::uuid=entity then raise exception 'Invalid parent';end if;
   select t.data into parent from public."code-todo" t where t.user_id=uid and t.id=(merged->>'parentId')::uuid and t.deleted_at is null;
   if parent is null or parent->>'parentId' is not null then raise exception 'Parent not available';end if;
  end if;
  execute format('insert into public.%I(user_id,id,data,deleted_at,updated_at) values($1,$2,$3,$4,now()) on conflict(user_id,id) do update set data=excluded.data,deleted_at=excluded.deleted_at,updated_at=now(),revision=nextval(''tick_private.revision_seq'')',tbl)
   using uid,entity,merged,case when action='delete' then now() when action='restore' then null else old.deleted_at end;
  if kind='todo' and (patch->>'done'='true' or action='delete') then
   for child in select * from public."code-todo" t where t.user_id=uid and t.data->>'parentId'=entity::text and t.deleted_at is null loop
    insert into tick_private.history(user_id,item) values(uid,child.data||jsonb_build_object('id',child.id,'kind','todo','deletedAt',child.deleted_at,'updatedAt',child.updated_at));
    update public."code-todo" set data=case when action='delete' then data else data||'{"done":true}'::jsonb end,deleted_at=case when action='delete' then now() else deleted_at end,updated_at=now(),revision=nextval('tick_private.revision_seq') where user_id=uid and id=child.id;
   end loop;
  end if;
  insert into tick_private.operations values(uid,op,m,now());accepted:=accepted||jsonb_build_array(op);
 end loop;
 delete from tick_private.history where user_id=uid and at<now()-interval '7 days';
 -- Keep deletion identity indefinitely; remove old user-visible deleted content.
 update public."code-todo" set data=base||'{"title":"Deleted item"}',revision=nextval('tick_private.revision_seq') where user_id=uid and deleted_at<now()-interval '7 days' and data->>'title'<>'Deleted item';
 update public."movies-todo" set data=base||'{"title":"Deleted item"}',revision=nextval('tick_private.revision_seq') where user_id=uid and deleted_at<now()-interval '7 days' and data->>'title'<>'Deleted item';
 select coalesce(jsonb_agg(x.item),'[]'),coalesce(max(x.revision),after_cursor) into result,cursor_value from(
  select data||jsonb_build_object('id',id,'kind','todo','deletedAt',deleted_at,'updatedAt',updated_at) as item,revision from public."code-todo" where user_id=uid and revision>after_cursor
  union all select data||jsonb_build_object('id',id,'kind','movie','deletedAt',deleted_at,'updatedAt',updated_at),revision from public."movies-todo" where user_id=uid and revision>after_cursor
 )x;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'item',item,'at',at) order by at),'[]') into hist from tick_private.history where user_id=uid;
 return jsonb_build_object('items',result,'accepted',accepted,'cursor',cursor_value,'history',hist);
end $$;
revoke all on function tick_private.sync(jsonb,bigint) from public,anon;
grant execute on function tick_private.sync(jsonb,bigint) to authenticated;
create function public.tick_sync(mutations jsonb,after_cursor bigint) returns jsonb language sql security invoker set search_path='' as $$ select tick_private.sync(mutations,after_cursor) $$;
revoke all on function public.tick_sync(jsonb,bigint) from public,anon;
grant execute on function public.tick_sync(jsonb,bigint) to authenticated;
commit;
