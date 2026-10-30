-- Booking creation used to HTML-escape names and allergy notes before saving them, so the
-- stored text contains entities (e.g. "garlic&#x2F;onion") that the admin dashboard shows
-- literally. Text is now stored as typed and escaped where it is rendered; this restores
-- the rows saved under the old behaviour.
--
-- The old escaping never touched '&', so '&amp;' is not reversed here, and any '&' already
-- in these columns came from the guest. Only the five entities the old code produced are
-- replaced.
UPDATE bookings
SET
  first_name = replace(replace(replace(replace(replace(first_name,
    '&#x2F;', '/'), '&#x27;', ''''), '&quot;', '"'), '&lt;', '<'), '&gt;', '>'),
  last_name = replace(replace(replace(replace(replace(last_name,
    '&#x2F;', '/'), '&#x27;', ''''), '&quot;', '"'), '&lt;', '<'), '&gt;', '>'),
  allergy_info = replace(replace(replace(replace(replace(allergy_info,
    '&#x2F;', '/'), '&#x27;', ''''), '&quot;', '"'), '&lt;', '<'), '&gt;', '>')
WHERE first_name LIKE '%&%' OR last_name LIKE '%&%' OR allergy_info LIKE '%&%';
