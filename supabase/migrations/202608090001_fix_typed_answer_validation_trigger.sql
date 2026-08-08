-- Extend the existing question-row trigger for Typed Answer without changing the
-- validation rules for the six previously supported question types.

create or replace function public.validate_question_json()
returns trigger language plpgsql set search_path = public as $$
declare
  v_min numeric;
  v_max numeric;
  v_step numeric;
  v_correct numeric;
  v_tolerance numeric;
begin
  if jsonb_typeof(new.type_config) <> 'object' or jsonb_typeof(new.answer_key) <> 'object' then
    raise exception 'Question configuration must be a JSON object';
  end if;
  case new.question_type
    when 'single-choice' then
      if nullif(new.answer_key ->> 'correctOptionId', '') is null then raise exception 'Single choice requires one correct option'; end if;
    when 'multiple-select' then
      if jsonb_typeof(new.answer_key -> 'correctOptionIds') <> 'array'
        or jsonb_array_length(new.answer_key -> 'correctOptionIds') < 2
        or (new.type_config ->> 'minimumSelections')::integer < 1
        or (new.type_config ->> 'maximumSelections')::integer < (new.type_config ->> 'minimumSelections')::integer
        or new.type_config ->> 'scoringMode' not in ('exact', 'partial-wipeout')
      then raise exception 'Invalid multiple-select configuration'; end if;
    when 'true-false' then
      if jsonb_typeof(new.answer_key -> 'correctValue') <> 'boolean' then raise exception 'True/false requires a Boolean answer'; end if;
    when 'slider' then
      v_min := (new.type_config ->> 'minimum')::numeric;
      v_max := (new.type_config ->> 'maximum')::numeric;
      v_step := (new.type_config ->> 'step')::numeric;
      v_correct := (new.answer_key ->> 'correctValue')::numeric;
      v_tolerance := (new.answer_key ->> 'tolerance')::numeric;
      if v_min >= v_max or v_step <= 0 or v_correct not between v_min and v_max or v_tolerance < 0
      then raise exception 'Invalid slider configuration'; end if;
    when 'pinpoint' then
      if new.media ->> 'type' <> 'image'
        or (new.answer_key ->> 'targetX')::numeric not between 0 and 1
        or (new.answer_key ->> 'targetY')::numeric not between 0 and 1
        or (new.answer_key ->> 'targetRadius')::numeric not between 0.000001 and 1
      then raise exception 'Invalid pinpoint configuration'; end if;
    when 'mashup' then
      if new.media ->> 'type' <> 'image'
        or jsonb_typeof(new.answer_key -> 'correctMemberIds') <> 'array'
        or jsonb_array_length(new.answer_key -> 'correctMemberIds') <> 2
        or new.answer_key -> 'correctMemberIds' ->> 0 = new.answer_key -> 'correctMemberIds' ->> 1
      then raise exception 'Mash-up requires exactly two different correct people'; end if;
    when 'typed-answer' then
      if jsonb_typeof(new.answer_key -> 'correctAnswer') is distinct from 'string'
        or char_length(new.answer_key ->> 'correctAnswer') > 120
        or coalesce(public.normalise_typed_answer(new.answer_key ->> 'correctAnswer'), '') = ''
      then raise exception 'Typed Answer needs a primary answer of 1-120 meaningful characters'; end if;

      if jsonb_typeof(new.answer_key -> 'acceptedAnswers') is distinct from 'array' then
        raise exception 'Typed Answer alternatives must be a JSON array';
      end if;

      if jsonb_array_length(new.answer_key -> 'acceptedAnswers') > 19
        or exists (
          select 1
          from jsonb_array_elements(new.answer_key -> 'acceptedAnswers') as answer(value)
          where jsonb_typeof(answer.value) is distinct from 'string'
            or char_length(answer.value #>> '{}') > 120
            or coalesce(public.normalise_typed_answer(answer.value #>> '{}'), '') = ''
        )
      then raise exception 'Typed Answer alternatives must contain up to 19 meaningful answers of at most 120 characters'; end if;

      if exists (
        select 1
        from jsonb_array_elements_text(
          jsonb_build_array(new.answer_key ->> 'correctAnswer') || (new.answer_key -> 'acceptedAnswers')
        ) as answer(value)
        group by public.normalise_typed_answer(answer.value)
        having count(*) > 1
      ) then raise exception 'Typed answers must be unique after normalisation'; end if;
    else
      raise exception 'Unsupported question type: %', new.question_type;
  end case;
  return new;
end;
$$;
