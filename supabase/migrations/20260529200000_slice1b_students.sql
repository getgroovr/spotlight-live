-- Slice 1B: students, enrollments, game_sessions tables + pod_number on entries

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  photo_url text,
  created_at timestamptz default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  round int not null default 1,
  enrolled_at timestamptz default now(),
  unique(student_id, class_id)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  round int not null default 1,
  comments jsonb not null default '{}',
  favorites jsonb not null default '{}',
  completed_at timestamptz default now()
);

alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.game_sessions enable row level security;

alter table public.entries
  add column if not exists pod_number int check (pod_number in (1, 2, 3));

create policy "student reads own row"
  on public.students for select
  using (auth.email() = email);

create policy "teacher reads enrolled students"
  on public.students for select
  using (
    exists (
      select 1 from public.enrollments e
      join public.classes c on c.id = e.class_id
      where e.student_id = students.id
        and c.teacher_id = auth.uid()
    )
  );

create policy "teacher reads enrollments"
  on public.enrollments for select
  using (
    exists (
      select 1 from public.classes c
      where c.id = enrollments.class_id
        and c.teacher_id = auth.uid()
    )
  );

create policy "teacher reads game sessions"
  on public.game_sessions for select
  using (
    exists (
      select 1 from public.classes c
      where c.id = game_sessions.class_id
        and c.teacher_id = auth.uid()
    )
  );