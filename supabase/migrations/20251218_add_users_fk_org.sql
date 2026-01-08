ALTER TABLE public.users
  ADD CONSTRAINT users_workshop_fk FOREIGN KEY (workshop_id)
    REFERENCES public.workshops(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.users
  ADD CONSTRAINT users_team_fk FOREIGN KEY (team_id)
    REFERENCES public.teams(id)
    ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_workshop ON public.users(workshop_id);
CREATE INDEX IF NOT EXISTS idx_users_team ON public.users(team_id);
