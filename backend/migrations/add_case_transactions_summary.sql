-- Summary of case transactions with filter support
create or replace function get_case_transactions_summary(
  p_case_id uuid,
  p_entity_ids uuid[] default null,
  p_account_ids uuid[] default null,
  p_transaction_ids uuid[] default null,
  p_date_from date default null,
  p_date_to date default null,
  p_min_amount numeric default null,
  p_max_amount numeric default null,
  p_direction text default null,
  p_status text default null,
  p_description text default null,
  p_counterparty text default null,
  p_query text default null,
  p_search_entity_ids uuid[] default null,
  p_search_account_ids uuid[] default null
)
returns table(
  total_count bigint,
  total_amount numeric
)
language sql
stable
as $$
  with case_entities as (
    select entity_id
    from case_entities
    where case_id = p_case_id
  )
  select
    count(*)::bigint as total_count,
    coalesce(sum(t.amount), 0) as total_amount
  from transactions t
  where t.entity_id in (select entity_id from case_entities)
    and (p_entity_ids is null or t.entity_id = any(p_entity_ids))
    and (p_account_ids is null or t.account_id = any(p_account_ids))
    and (p_transaction_ids is null or t.transaction_id = any(p_transaction_ids))
    and (p_date_from is null or t.tx_date >= p_date_from)
    and (p_date_to is null or t.tx_date <= p_date_to)
    and (p_min_amount is null or t.amount >= p_min_amount)
    and (p_max_amount is null or t.amount <= p_max_amount)
    and (p_direction is null or t.direction = p_direction)
    and (
      p_status is null
      or (p_status = 'Failed' and coalesce(trim(t.counterparty_merged), '') = '')
      or (p_status = 'Success' and coalesce(trim(t.counterparty_merged), '') <> '')
    )
    and (p_description is null or coalesce(t.description, '') ilike '%' || p_description || '%')
    and (p_counterparty is null or coalesce(t.counterparty_merged, '') ilike '%' || p_counterparty || '%')
    and (
      (p_query is null and p_search_entity_ids is null and p_search_account_ids is null)
      or (
        p_query is not null
        and (
          coalesce(t.description, '') ilike '%' || p_query || '%'
          or t.transaction_id::text ilike '%' || p_query || '%'
          or coalesce(t.counterparty_merged, '') ilike '%' || p_query || '%'
        )
      )
      or (p_search_entity_ids is not null and t.entity_id = any(p_search_entity_ids))
      or (p_search_account_ids is not null and t.account_id = any(p_search_account_ids))
    );
$$;
