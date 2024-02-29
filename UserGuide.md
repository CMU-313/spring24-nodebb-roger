# User Guide

## Homework Questions
_Author_: Chenjia Fan (`chenjiaf`)

This feature adds the ability to make a post private, only viewable to the owner or moderators, or public, viewable to everyone. This allows students to post questions to teachers or TA's without violating AIV.

### How to test

This [video](https://drive.google.com/file/d/12BesY3owj4EiusoBpnUDZ-tz93bMv93Y/view?usp=sharing) shows a quick demo of how to use the feature.

#### User Testing Instructions
1. Build and run NodeBB
2. Note that you can only private a topic if (1) You are an admin or moderator or (2) you are the topic owner. So you will need to navigate to an existing topic reply as an admin/mod, or create a new one where you are the original poster.
3. Open the "topic tools" menu (the cog next to the blue reply button).
4. One of the tools should be "Make post private" or "Make post public", labelled with a "lock" icon. Click on the button!
    - Note that the button should not appear if you do not have one of the roles described above.
5. Switch to another account, not an admin or moderator one, and you should see that the topic title is "This topic is private!"
6. You can repeat the same steps to make the topic public, or try privating multiple topics!

### Automated Tests
If the `iss8` branch is merged, the tests can be found in `tests/topics.js`. We test the following:
- Test that the private status is correctly reflected in the database after privating as the topic owner. Test the status again after making the topic public.
- The following tests try to enforce that the topic is correctly rendered based on user permissions based on a new `private` flag. This flag is used in the front-end code to decide whether to render the topic normally or as a privated topic.
    - The topic owner should be able to see the topic normally.
    - An administrator should be able to see the topic normally.
    - A "global moderator" should be able to see the topic normally.
    - Another user (i.e. one that isn't the topic owner) should see "This topic is private!" as the topic title. The user should also not be able to click into the topic. The tests enforce this by creating a new user and invoking the API call that provides the data needed to render the list of topics in a category.

I think these tests are sufficient because they _both_ ensure that the new API route persists the `private` state of a topic to the database _and_ enforce that only users with the appropriate roles can see the topic once its private. The tests cover all the relevant combinations of user permissions.

The tests cover all of the acceptance criteria in issues #8, #9, and #10. But does not test if an user being able to click on a private topic or not. That was tested manually.

## Topic Searching
_Author_: Bryce Zhang (`brycez1`)

This feature allows the user to search for posts with a topic title filter using the already integrated advanced-search feature. Enabling the preinstalled db-search plugin is required for database search querying.

### How to test

[video](https://drive.google.com/file/d/18t3Ljpz7oU97IbQQtn-HoxzLYdLLndgC/view?usp=drive_link) demo of topic search filter.

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
