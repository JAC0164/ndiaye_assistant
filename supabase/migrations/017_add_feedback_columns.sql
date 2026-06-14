ALTER TABLE historique
  ADD COLUMN completed          boolean,
  ADD COLUMN ressenti           smallint CHECK (ressenti BETWEEN 1 AND 3),
  ADD COLUMN duree_reelle_min   integer  CHECK (duree_reelle_min >= 0),
  ADD COLUMN rescheduled_from   uuid     REFERENCES historique(id) ON DELETE SET NULL;

COMMENT ON COLUMN historique.ressenti IS '1=difficile 2=moyen 3=facile';
COMMENT ON COLUMN historique.rescheduled_from IS 'Points to the original session if this is a rescheduled copy';
