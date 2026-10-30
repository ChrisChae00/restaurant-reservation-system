-- Purpose of the group visit, chosen by the guest on the details step.
-- Nullable because bookings made before this column existed have no value.
ALTER TABLE bookings ADD COLUMN visit_purpose TEXT
  CHECK (visit_purpose IN ('family_reunion', 'corporate_event', 'personal_gathering'));
