{{{each pinnedPosts.user.selectedGroups}}}
<!-- IF pinnedPosts.user.selectedGroups.slug -->
<a href="{config.relative_path}/groups/{pinnedPosts.user.selectedGroups.slug}"><small class="label group-label inline-block" style="color:{pinnedPosts.user.selectedGroups.textColor};background-color: {pinnedPosts.user.selectedGroups.labelColor};"><!-- IF pinnedPosts.user.selectedGroups.icon --><i class="fa {pinnedPosts.user.selectedGroups.icon}"></i> <!-- ENDIF pinnedPosts.user.selectedGroups.icon -->{pinnedPosts.user.selectedGroups.userTitle}</small></a>
<!-- ENDIF pinnedPosts.user.selectedGroups.slug -->
{{{end}}}