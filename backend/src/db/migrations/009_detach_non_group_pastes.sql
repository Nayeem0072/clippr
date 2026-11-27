-- Only group pastes belong to a group. Editing a group paste to public/private used to keep
-- its group_id, so it kept showing on the group's page. Detach those, and unfile any of them
-- still sitting in a group collection.
UPDATE documents SET collection_id = NULL
 WHERE privacy != 'group'
   AND collection_id IN (SELECT id FROM collections WHERE group_id IS NOT NULL);

UPDATE documents SET group_id = NULL WHERE privacy != 'group' AND group_id IS NOT NULL;
