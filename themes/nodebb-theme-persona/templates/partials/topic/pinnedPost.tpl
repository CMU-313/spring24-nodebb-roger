<div class="clearfix post-header">
    <div class="icon pull-left">
        <a href="<!-- IF pinnedPosts.user.userslug -->{config.relative_path}/user/{pinnedPosts.user.userslug}<!-- ELSE -->#<!-- ENDIF pinnedPosts.user.userslug -->">
            {buildAvatar(pinnedPosts.user, "sm2x", true, "", "user/picture")}
            <i component="user/status" class="fa fa-circle status {pinnedPosts.user.status}" title="[[global:{pinnedPosts.user.status}]]"></i>
        </a>
    </div>

    <small class="pull-left">
        <strong>
            <a href="<!-- IF pinnedPosts.user.userslug -->{config.relative_path}/user/{pinnedPosts.user.userslug}<!-- ELSE -->#<!-- ENDIF pinnedPosts.user.userslug -->" itemprop="author" data-username="{pinnedPosts.user.username}" data-uid="{pinnedPosts.user.uid}">{pinnedPosts.user.displayname}</a>
        </strong>

        <!-- IMPORT partials/topic/pinnedBadge.tpl -->

        <!-- IF pinnedPosts.user.banned -->
        <span class="label label-danger">[[user:banned]]</span>
        <!-- ENDIF pinnedPosts.user.banned -->

        <span class="visible-xs-inline-block visible-sm-inline-block visible-md-inline-block visible-lg-inline-block">
            <!-- IF pinnedPosts.toPid -->
            <a component="post/parent" class="btn btn-xs btn-default hidden-xs" data-topid="{pinnedPosts.toPid}" href="{config.relative_path}/post/{pinnedPosts.toPid}"><i class="fa fa-reply"></i> @<!-- IF pinnedPosts.parent.username -->{pinnedPosts.parent.username}<!-- ELSE -->[[global:guest]]<!-- ENDIF pinnedPosts.parent.username --></a>
            <!-- ENDIF pinnedPosts.toPid -->

            <span>
                <!-- IF pinnedPosts.user.custom_profile_info.length -->
                &#124;
                {{{each pinnedPosts.user.custom_profile_info}}}
                {pinnedPosts.user.custom_profile_info.content}
                {{{end}}}
                <!-- ENDIF pinnedPosts.user.custom_profile_info.length -->
            </span>
        </span>

    </small>
    <small class="pull-right">
        <span class="bookmarked"><i class="fa fa-bookmark-o"></i></span>
    </small>
    <small class="pull-right">
        <i component="post/edit-indicator" class="fa fa-pencil-square<!-- IF privileges.pinnedPosts:history --> pointer<!-- END --> edit-icon <!-- IF !pinnedPosts.editor.username -->hidden<!-- ENDIF !pinnedPosts.editor.username -->"></i>

        <small data-editor="{pinnedPosts.editor.userslug}" component="post/editor" class="hidden">[[global:last_edited_by, {pinnedPosts.editor.username}]] <span class="timeago" title="{pinnedPosts.editedISO}"></span></small>

        {{{ if pinnedPosts.pinned }}}
            <span class="visible-xs-inline-block visible-sm-inline-block visible-md-inline-block visible-lg-inline-block"><i class="fa fa-thumbtack" style="color: red;"></i> Pinned &nbsp;</span>
        {{{ end }}}

        <span class="visible-xs-inline-block visible-sm-inline-block visible-md-inline-block visible-lg-inline-block">
            <a class="permalink" href="{config.relative_path}/post/{pinnedPosts.pid}"><span class="timeago" title="{pinnedPosts.timestampISO}"></span></a>
        </span>
    </small>
</div>

<br />

<div class="content" component="post/content" itemprop="text">
    {pinnedPosts.content}
</div>

<div class="post-footer">
    {{{ if pinnedPosts.user.signature }}}
    <div component="post/signature" data-uid="{pinnedPosts.user.uid}" class="post-signature">{pinnedPosts.user.signature}</div>
    {{{ end }}}

    <div class="clearfix">
    {{{ if !hideReplies }}}
    <a component="post/reply-count" data-target-component="post/replies/container" href="#" class="threaded-replies no-select pull-left {{{ if !pinnedPosts.replies.count }}}hidden{{{ end }}}">
        <span component="post/reply-count/avatars" class="avatars {{{ if pinnedPosts.replies.hasMore }}}hasMore{{{ end }}}">
            {{{each pinnedPosts.replies.users}}}
            {buildAvatar(pinnedPosts.replies.users, "xs", true, "")}
            {{{end}}}
        </span>

        <span class="replies-count" component="post/reply-count/text" data-replies="{pinnedPosts.replies.count}">{pinnedPosts.replies.text}</span>
        <span class="replies-last hidden-xs">[[topic:last_reply_time]] <span class="timeago" title="{pinnedPosts.replies.timestampISO}"></span></span>

        <i class="fa fa-fw fa-chevron-right" component="post/replies/open"></i>
        <i class="fa fa-fw fa-chevron-down hidden" component="post/replies/close"></i>
        <i class="fa fa-fw fa-spin fa-spinner hidden" component="post/replies/loading"></i>
    </a>
    {{{ end }}}

    <small class="pull-right">
        <!-- IMPORT partials/topic/reactions.tpl -->
        <span class="post-tools">
            <a component="post/reply" href="#" class="no-select <!-- IF !privileges.topics:reply -->hidden<!-- ENDIF !privileges.topics:reply -->">[[topic:reply]]</a>
            <a component="post/quote" href="#" class="no-select <!-- IF !privileges.topics:reply -->hidden<!-- ENDIF !privileges.topics:reply -->">[[topic:quote]]</a>
        </span>

        <!-- IF !reputation:disabled -->
        <span class="votes">
            <a component="post/upvote" href="#" class="<!-- IF pinnedPosts.upvoted -->upvoted<!-- ENDIF pinnedPosts.upvoted -->">
                <i class="fa fa-chevron-up"></i>
            </a>

            <span component="post/vote-count" data-votes="{pinnedPosts.votes}">{pinnedPosts.votes}</span>

            <!-- IF !downvote:disabled -->
            <a component="post/downvote" href="#" class="<!-- IF pinnedPosts.downvoted -->downvoted<!-- ENDIF pinnedPosts.downvoted -->">
                <i class="fa fa-chevron-down"></i>
            </a>
            <!-- ENDIF !downvote:disabled -->
        </span>
        <!-- ENDIF !reputation:disabled -->

        <!-- IMPORT partials/topic/pinned-post-menu.tpl -->
    </small>
    </div>
    <div component="post/replies/container"></div>
</div>