-- count = 0 means never successfully looked up in the app; queried_at must be null.

update kfz.prefixes
set queried_at = null
where count = 0
  and queried_at is not null;

alter table kfz.prefixes
  add constraint prefixes_queried_at_null_when_unfound
  check (count > 0 or queried_at is null);
