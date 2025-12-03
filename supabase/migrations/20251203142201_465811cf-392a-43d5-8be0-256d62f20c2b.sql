-- Insert sample competitor tracking data for testing
INSERT INTO competitors (
  product_id, initial_rank, current_rank, rank_change, initial_rating, current_rating, rating_change,
  initial_reviews, current_reviews, reviews_per_day, review_growth_rate, days_tracked, is_breakout, tracking_start_date
) VALUES 
  ('828f9a96-b9bb-458d-9a18-f5cd9b79eff1', 15, 8, 7, 4.2, 4.5, 0.3, 1200, 1850, 8.5, 54.2, 76, true, '2025-09-15'),
  ('53f7e622-94ed-4280-94c1-3f45ec9cf605', 5, 3, 2, 4.6, 4.7, 0.1, 8500, 12400, 12.3, 45.9, 120, true, '2025-08-01'),
  ('2cda6180-2bdd-408d-af70-9b008f7201db', 22, 12, 10, 4.1, 4.4, 0.3, 650, 1100, 5.6, 69.2, 80, true, '2025-09-10'),
  ('054150c5-e571-41eb-bd1e-20ed17122e82', 3, 2, 1, 4.8, 4.8, 0.0, 25000, 28500, 15.2, 14.0, 230, false, '2025-05-01'),
  ('3be42dd0-fe56-4cfc-9e32-60e1c3733352', 8, 6, 2, 4.5, 4.6, 0.1, 5200, 7800, 9.1, 50.0, 95, true, '2025-08-28'),
  ('5150b3d0-dc99-45f1-8404-c601841ea566', 12, 10, 2, 4.3, 4.4, 0.1, 3800, 4900, 4.8, 28.9, 110, false, '2025-07-15'),
  ('942ae558-cba8-4949-acb2-101285bcbaf9', 18, 14, 4, 4.0, 4.3, 0.3, 1500, 2100, 6.7, 40.0, 90, true, '2025-09-01'),
  ('bc1778f1-d263-4d97-8092-b8d2d2f7e465', 6, 5, 1, 4.7, 4.7, 0.0, 15000, 17200, 7.8, 14.7, 180, false, '2025-06-01'),
  ('b3699544-7b5b-4fba-b93d-fafea8a1ba51', 10, 8, 2, 4.4, 4.5, 0.1, 9000, 11500, 6.9, 27.8, 150, false, '2025-06-15'),
  ('b960fdbd-7acb-42df-a4c0-049d2e923274', 25, 15, 10, 3.9, 4.2, 0.3, 400, 980, 7.2, 145.0, 80, true, '2025-09-12');