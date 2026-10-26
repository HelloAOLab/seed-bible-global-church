-- The act-as-me standing wires (0002) are not kept after all: a standing permission cannot finish adding a contact
-- without being able to approve any digest as the person, so adding a friend stays one prompt at the Home instead.
DROP TABLE IF EXISTS act_grants;
