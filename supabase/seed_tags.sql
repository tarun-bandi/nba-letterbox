-- Default log tags
INSERT INTO log_tags (name, slug) VALUES
  ('Buzzer Beater', 'buzzer-beater'),
  ('Overtime', 'overtime'),
  ('Blowout', 'blowout'),
  ('Comeback', 'comeback'),
  ('Rivalry', 'rivalry'),
  ('Playoff Intensity', 'playoff-intensity'),
  ('Record Breaking', 'record-breaking'),
  ('Defensive Battle', 'defensive-battle'),
  ('High Scoring', 'high-scoring'),
  ('Must Watch', 'must-watch'),
  ('Classic', 'classic'),
  ('Upset', 'upset')
ON CONFLICT (slug) DO NOTHING;
