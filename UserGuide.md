# User Guide

## Topic Searching
_Author_: Bryce Zhang (`brycez1`)

This feature allows the user to search for posts with a topic title filter using the already integrated advanced-search feature. Enabling the preinstalled db-search plugin is required for database search querying.

#### User Testing Instructions
1. From the NodeBB console, enable the db-search plugin.
2. Build and run NodeBB
3. As an admin, reindex all existing posts as db-search does not do so automatically when it is first enabled, or make new posts after enabling the plugin which automatically be indexed.
4. Open the "Advanced Search" menu which should appear as a gear in the search bar at the top of the page.
5. Ensure that the search toggle is set to "titles", "posts", or "titles and posts".
6. Locate the "topic name" search field and then add a filter for the desired topic.
7. You can now fill in all of the other fields as desired and will be able to filter for topic names.

### Automated Tests
The tests for this feature can be found in `tests/search.js`. 
- Tests that the search finds the correct post if the correct topic name is placed in the filter.
- Returns nothing if no posts match the filter description.

I think these tests are sufficient because they ensure that the filter functions as necessary by finding posts that match the query while also working correctly if nothing is found. For displaying posts with the correct topic name, is successfully filters out the other post which matches the other query descriptions.

The tests cover all of the acceptance criteria in issues #3, #6, and #7 with slight modifications as the acceptance criteria for #3 was shifted from querying for a search term to just a topic filter after the realiziation that the db-search plugin already exists. The actual existence and usability of the search bar were tested manually.