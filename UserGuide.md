# User Guide

## Pinned Posts
_Author_: Theo Kroening (`tkroenin`)

This feature adds the ability to pin posts (that is, individual messages within NodeBB _topics_) so that they appear at the top of topics. This is just like the feature for Reddit, or the YouTube comments section.

### How to test

This [video](https://drive.google.com/file/d/1FkU2bUGCFgOJrWhtXpz4Qvdkeb4p6idO/view?usp=sharing) shows a quick demo of how to use the feature.

#### User Testing Instructions
1. Build and run NodeBB
2. Note that you can only pin posts if (1) You are an admin or moderator or (2) you are the topic owner. So you will need to navigate to an existing topic reply as an admin/mod, or create a new thread where you are the original poster.
3. Open the "post tools" menu (the three dots underneath the post body).
4. One of the tools should be "Pin post" or "Unpin post", labelled with a "thumbtack" icon. Click on the button!
    - Note that the button should not appear if you do not have one of the roles described above.
5. The post will now appear alongside the original post at the top of the topic. If you are using pagination, the button will take you to the top of the post.
6. You can repeat the same steps to unpin the post, or try pinning multiple posts!

### Automated Tests
If the `pinned-posts` branch is merged, the tests can be found in `tests/posts.js`. We test the following:
- Test that the pinned status is correctly reflected in the database after pinning as the topic owner. Test the status again after unpinning the post.
- The following tests try to enforce that the button is correctly rendered/not rendered based on user permissions based on a new `displayPin` flag. This flag is used in the front-end code to decide whether to render the button.
    - The topic owner should be able to see the button.
    - An administrator should be able to see the button.
    - A "global moderator" should be able to see the button.
    - Another user (i.e. one that isn't the topic owner) should not be able to see the button. The tests enforce this by creating a new user and invoking the API call that provides the data needed to render the post tools UI.

I think these tests are sufficient because they _both_ ensure that the new API route persists the `pinned` state of a post to the database _and_ enforce that only users with the appropriate roles can see the button. The tests cover all the relevant combinations of user permissions.

The tests cover almost all of the acceptance criteria in issues #1, #2, and #4, other than visual characteristics like "should appear at the top" or "has visual feedback". These were tested manually.

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
