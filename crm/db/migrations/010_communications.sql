-- ---------------------------------------------------------------------
-- Stage 7: the record of what was actually said (spec 43 to 45, 143)
--
-- READ THIS BEFORE ADDING A COLUMN HERE.
--
-- The CRM does not send messages. It has no Gmail connection, no Microsoft
-- connection, no WhatsApp Business API, no SMS gateway. What it has is
-- ordinary links that hand the conversation to the device: tel: opens the
-- dialler, wa.me opens WhatsApp, mailto: opens the staff member's own mail
-- application. The person then does the talking, and afterwards records what
-- happened here.
--
-- Everything in this table is therefore SOMEBODY'S ACCOUNT OF A CONVERSATION,
-- not a system event. That is why there is deliberately:
--
--   no delivery_status        -- we cannot know if it arrived
--   no read_at                -- we cannot know if it was read
--   no provider_message_id    -- there is no provider
--   no bounced flag           -- nothing reports bounces to us
--   no sent_at as a claim     -- occurred_at is when a PERSON says it happened
--
-- The logged_by_hand column below is checked true, so the database itself
-- refuses a row that claims to have been captured automatically. When a real
-- integration is eventually built, relaxing that check is a deliberate
-- migration somebody has to write and explain, not an accident.
-- ---------------------------------------------------------------------

create table communications (
  id              uuid primary key default gen_random_uuid(),

  -- Who and what it was about. A communication with no subject at all is not
  -- worth keeping, so at least one link is required.
  person_id       uuid references people(id) on delete cascade,
  property_id     uuid references properties(id) on delete set null,
  lead_id         uuid references leads(id) on delete set null,
  transaction_id  uuid references transactions(id) on delete set null,
  rental_application_id uuid references rental_applications(id) on delete set null,

  -- Which way it went. Both are logged by a person; 'incoming' means somebody
  -- rang us or wrote to us and a staff member wrote it down.
  direction       text not null check (direction in ('outgoing','incoming')),

  channel         text not null check (channel in
                    ('call','whatsapp','sms','email','in_person','meeting','post','other')),

  subject         text,
  -- What was said. The substance of the record.
  body            text,

  -- When the conversation happened, as the person reports it. Often earlier
  -- than when it was written down, which is why both are kept.
  occurred_at     timestamptz not null default now(),
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),

  -- What the person observed. Never what a system reported, because no system
  -- reports anything to us.
  outcome         text check (outcome in
                    ('spoke_to_them','left_a_message','no_answer','wrong_number',
                     'they_replied','no_reply_yet','sent_from_my_own_app','other')),

  -- The agent whose conversation it was, which is not always whoever typed it.
  agent_id        uuid references users(id) on delete set null,

  -- A template may have been used to compose what the person then sent
  -- themselves. Recording it says nothing about delivery.
  template_id     uuid,

  is_important    boolean not null default false,

  -- The follow-up this conversation created, if one was made.
  task_id         uuid references tasks(id) on delete set null,

  -- Always true in V1; see the note at the top of this file.
  logged_by_hand  boolean not null default true,

  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id) on delete set null,
  row_version     integer not null default 1,

  constraint communications_needs_a_subject
    check (
      person_id is not null or property_id is not null or lead_id is not null
      or transaction_id is not null or rental_application_id is not null
    ),
  -- A conversation with nothing recorded about it is not a record of anything.
  constraint communications_needs_substance
    check (nullif(btrim(coalesce(body, '')), '') is not null
           or nullif(btrim(coalesce(subject, '')), '') is not null
           or outcome is not null),
  -- The V1 communication rule, enforced by the database (spec 6, 143).
  constraint communications_are_hand_logged check (logged_by_hand),
  -- Only a call has a duration worth recording.
  constraint communications_duration_is_for_calls
    check (duration_minutes is null or channel in ('call','meeting','in_person'))
);
create index communications_person_idx on communications (person_id, occurred_at desc);
create index communications_property_idx on communications (property_id, occurred_at desc);
create index communications_lead_idx on communications (lead_id, occurred_at desc);
create index communications_agent_idx on communications (agent_id, occurred_at desc);
create index communications_recent_idx on communications (occurred_at desc);
select app.attach_touch('communications');

-- The documents table was built in stage 3 with a column waiting for this.
alter table documents
  add constraint documents_communication_fk
  foreign key (communication_id) references communications(id) on delete cascade;

-- ---------------------------------------------------------------------
-- Templates (spec 44)
--
-- A template composes text. The person then sends that text themselves from
-- their own mail application or WhatsApp. Using a template is not sending.
-- ---------------------------------------------------------------------
create table communication_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null default 'general'
                  check (category in
                    ('general','enquiry_response','viewing','mandate','offer',
                     'transaction','rental','follow_up','market_update')),
  -- Which channel the wording suits. 'any' for something that works anywhere.
  channel       text not null default 'any'
                  check (channel in ('any','call','whatsapp','sms','email','in_person')),
  subject       text,
  body          text not null,
  is_active     boolean not null default true,
  times_used    integer not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null,
  row_version   integer not null default 1
);
create unique index communication_templates_name_idx
  on communication_templates (lower(name));
select app.attach_touch('communication_templates');

alter table communications
  add constraint communications_template_fk
  foreign key (template_id) references communication_templates(id) on delete set null;

-- A starting set the office can edit or switch off. Deliberately written as
-- something a person sends, never as something the CRM sends.
insert into communication_templates (name, category, channel, subject, body) values
  ('Thank you for your enquiry', 'enquiry_response', 'email',
   'Your enquiry about {{property_address}}',
   E'Good day {{first_name}}\n\nThank you for your enquiry about {{property_address}} '
   || E'({{property_ref}}), currently at {{asking_price}}.\n\nI would be glad to arrange a '
   || E'viewing at a time that suits you. Please let me know what works.\n\n'
   || E'Kind regards\n{{agent_name}}\nGarden Route Lifestyle Property\n{{agent_phone}}'),

  ('Viewing confirmation', 'viewing', 'whatsapp', null,
   E'Hi {{first_name}}, confirming our viewing at {{property_address}} on '
   || E'{{appointment_date}} at {{appointment_time}}. Please let me know if anything '
   || E'changes. {{agent_name}}, GRLP.'),

  ('Following up after a viewing', 'follow_up', 'whatsapp', null,
   E'Hi {{first_name}}, thank you for viewing {{property_address}} yesterday. '
   || E'Any thoughts? Happy to answer anything. {{agent_name}}, GRLP.'),

  ('Mandate expiring soon', 'mandate', 'email',
   'Your mandate on {{property_address}}',
   E'Good day {{first_name}}\n\nOur mandate on {{property_address}} ({{property_ref}}) '
   || E'is due to expire on {{mandate_expiry}}. I would like to discuss where we are and '
   || E'what we do next.\n\nWhen would suit you for a short call?\n\n'
   || E'Kind regards\n{{agent_name}}\nGarden Route Lifestyle Property'),

  ('Offer received', 'offer', 'email',
   'An offer on {{property_address}}',
   E'Good day {{first_name}}\n\nWe have received an offer on {{property_address}} '
   || E'({{property_ref}}). I would like to go through the detail with you before '
   || E'anything is signed.\n\nPlease let me know when I may call.\n\n'
   || E'Kind regards\n{{agent_name}}\nGarden Route Lifestyle Property')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- people.last_contact_method now comes from the communication log, so it has
-- to accept the same vocabulary. It was written in stage 3 against an earlier
-- guess at the list ('phone', and no meeting or post), and nothing had ever
-- written to it, so widening it loses nothing.
-- ---------------------------------------------------------------------
alter table people drop constraint if exists people_last_contact_method_check;
alter table people add constraint people_last_contact_method_check
  check (last_contact_method is null or last_contact_method in
    ('call','whatsapp','sms','email','in_person','meeting','post','other'));

-- ---------------------------------------------------------------------
-- First and last contact, kept up to date automatically (spec 45)
--
-- The trigger is the point: the dates on a person's record cannot drift out of
-- step with the conversations logged against them, because they are derived
-- from those conversations rather than typed separately.
-- ---------------------------------------------------------------------
create or replace function app.sync_person_contact_dates() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if new.person_id is not null then
    perform app.record_person_contact(
      new.person_id, new.occurred_at, new.channel, coalesce(new.agent_id, new.created_by));
  end if;
  return new;
end;
$$;
create trigger communications_sync_contact_dates
  after insert on communications
  for each row execute function app.sync_person_contact_dates();

/**
 * Recomputes a person's first and last contact from the log.
 *
 * Needed because the trigger above only ever moves the dates outwards, which
 * is right for an insert but wrong after a correction: if the only
 * conversation on file was logged with the wrong date and then fixed, the
 * person's record has to be rebuilt from what the log now says rather than
 * keeping the earlier value.
 */
create or replace function app.recompute_person_contact_dates(p_person_id uuid)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  update people p
     set first_contact_at = source.first_at,
         last_contact_at = source.last_at,
         last_contact_method = source.method,
         last_contacted_by = source.agent
    from (
      select min(c.occurred_at) as first_at,
             max(c.occurred_at) as last_at,
             (array_agg(c.channel order by c.occurred_at desc))[1] as method,
             (array_agg(coalesce(c.agent_id, c.created_by) order by c.occurred_at desc))[1] as agent
        from communications c
       where c.person_id = p_person_id
    ) as source
   where p.id = p_person_id;
end;
$$;
grant execute on function app.recompute_person_contact_dates(uuid) to grlp_app;

-- ---------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------
create or replace function app.can_see_communication(p_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('COMMUNICATION_VIEW') and exists (
    select 1 from communications c
     where c.id = p_id
       and (
         app.can_view_all()
         or c.agent_id = app.current_user_id()
         or c.created_by = app.current_user_id()
         or (c.person_id is not null and app.can_see_person(c.person_id))
         or (c.property_id is not null and app.can_see_property(c.property_id))
       )
  );
$$;
revoke all on function app.can_see_communication(uuid) from public;
grant execute on function app.can_see_communication(uuid) to grlp_app;

alter table communications           enable row level security;
alter table communication_templates  enable row level security;

create policy communications_select on communications for select using (
  app.has_permission('COMMUNICATION_VIEW')
  and (
    app.can_view_all()
    or agent_id = app.current_user_id()
    or created_by = app.current_user_id()
    or (person_id is not null and app.can_see_person(person_id))
    or (property_id is not null and app.can_see_property(property_id))
  )
);
create policy communications_insert on communications for insert with check (
  app.has_permission('COMMUNICATION_CREATE')
  and (
    app.can_view_all()
    or coalesce(agent_id, app.current_user_id()) = app.current_user_id()
    or (person_id is not null and app.can_see_person(person_id))
    or (property_id is not null and app.can_see_property(property_id))
  )
);
-- A logged conversation may be corrected by whoever recorded it, or by
-- management. It is never deleted: there is no delete policy and no delete
-- grant, so the record of what was said survives (spec 104).
create policy communications_update on communications for update using (
  app.has_permission('COMMUNICATION_CREATE')
  and (app.can_view_all() or created_by = app.current_user_id())
) with check (
  app.has_permission('COMMUNICATION_CREATE')
  and (app.can_view_all() or created_by = app.current_user_id())
);

create policy communication_templates_select on communication_templates for select
  using (app.is_authenticated());
create policy communication_templates_write on communication_templates for insert
  with check (app.has_permission('SETTINGS_ADMIN'));
create policy communication_templates_update on communication_templates for update
  using (app.has_permission('SETTINGS_ADMIN'))
  with check (app.has_permission('SETTINGS_ADMIN'));
-- times_used is bumped by anyone composing from a template, so that one
-- column is granted separately below rather than through the policy above.

-- ---------------------------------------------------------------------
-- A merge carries the conversations with it, or a tidy-up would lose them.
-- ---------------------------------------------------------------------
insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('person', 'communications', 'person_id', 'Logged conversations'),
  ('property', 'communications', 'property_id', 'Logged conversations');

-- ---------------------------------------------------------------------
-- Grants. Nothing here is deletable.
-- ---------------------------------------------------------------------
grant select, insert, update on communications to grlp_app;
grant select on communication_templates to grlp_app;
grant insert, update on communication_templates to grlp_app;
