'use strict';

module.exports = function (utils, Benchpress, relative_path) {
	Benchpress.setGlobal('true', true);
	Benchpress.setGlobal('false', false);

	const helpers = {
		displayMenuItem,
		buildMetaTag,
		buildLinkTag,
		stringify,
		escape,
		stripTags,
		generateCategoryBackground,
		generateChildrenCategories,
		generateTopicClass,
		membershipBtn: membershipButton,
		spawnPrivilegeStates,
		localeToHTML,
		renderTopicImage,
		renderTopicEvents,
		renderEvents,
		renderDigestAvatar,
		userAgentIcons,
		buildAvatar,
		register,
		__escape: identity,
	};

	function identity(string_) {
		return string_;
	}

	function displayMenuItem(data, index) {
		const item = data.navigation[index];
		if (!item) {
			return false;
		}

		if (item.route.match('/users') && data.user && !data.user.privileges['view:users']) {
			return false;
		}

		if (item.route.match('/tags') && data.user && !data.user.privileges['view:tags']) {
			return false;
		}

		if (item.route.match('/groups') && data.user && !data.user.privileges['view:groups']) {
			return false;
		}

		return true;
	}

	function buildMetaTag(tag) {
		const name = tag.name ? 'name="' + tag.name + '" ' : '';
		const property = tag.property ? 'property="' + tag.property + '" ' : '';
		const content = tag.content ? 'content="' + tag.content.replaceAll('\n', ' ') + '" ' : '';

		return '<meta ' + name + property + content + '/>\n\t';
	}

	function buildLinkTag(tag) {
		const attributes = ['link', 'rel', 'as', 'type', 'href', 'sizes', 'title', 'crossorigin'];
		const [link, rel, as, type, href, sizes, title, crossorigin] = attributes.map(attribute => (tag[attribute] ? `${attribute}="${tag[attribute]}" ` : ''));

		return '<link ' + link + rel + as + type + sizes + title + href + crossorigin + '/>\n\t';
	}

	function stringify(object) {
		// Turns the incoming object into a JSON string
		return JSON.stringify(object).replaceAll(/&/gm, '&amp;').replaceAll(/</gm, '&lt;').replaceAll(/>/gm, '&gt;')
			.replaceAll('"', '&quot;');
	}

	function escape(string_) {
		return utils.escapeHTML(string_);
	}

	function stripTags(string_) {
		return utils.stripHTMLTags(string_);
	}

	function generateCategoryBackground(category) {
		if (!category) {
			return '';
		}

		const style = [];

		if (category.bgColor) {
			style.push('background-color: ' + category.bgColor);
		}

		if (category.color) {
			style.push('color: ' + category.color);
		}

		if (category.backgroundImage) {
			style.push('background-image: url(' + category.backgroundImage + ')');
			if (category.imageClass) {
				style.push('background-size: ' + category.imageClass);
			}
		}

		return style.join('; ') + ';';
	}

	function generateChildrenCategories(category) {
		let html = '';
		if (!category || !category.children || category.children.length === 0) {
			return html;
		}

		for (const child of category.children) {
			if (child && !child.isSection) {
				const link = child.link ? child.link : (relative_path + '/category/' + child.slug);
				html += '<span class="category-children-item pull-left">'
                    + '<div role="presentation" class="icon pull-left" style="' + generateCategoryBackground(child) + '">'
                    + '<i class="fa fa-fw ' + child.icon + '"></i>'
                    + '</div>'
                    + '<a href="' + link + '"><small>' + child.name + '</small></a></span>';
			}
		}

		html = html ? ('<span class="category-children">' + html + '</span>') : html;
		return html;
	}

	function generateTopicClass(topic) {
		const fields = ['locked', 'pinned', 'deleted', 'unread', 'scheduled'];
		return fields.filter(field => Boolean(topic[field])).join(' ');
	}

	// Groups helpers
	function membershipButton(groupObject) {
		if (groupObject.isMember && groupObject.name !== 'administrators') {
			return '<button class="btn btn-danger" data-action="leave" data-group="' + groupObject.displayName + '"' + (groupObject.disableLeave ? ' disabled' : '') + '><i class="fa fa-times"></i> [[groups:membership.leave-group]]</button>';
		}

		if (groupObject.isPending && groupObject.name !== 'administrators') {
			return '<button class="btn btn-warning disabled"><i class="fa fa-clock-o"></i> [[groups:membership.invitation-pending]]</button>';
		}

		if (groupObject.isInvited) {
			return '<button class="btn btn-link" data-action="rejectInvite" data-group="' + groupObject.displayName + '">[[groups:membership.reject]]</button><button class="btn btn-success" data-action="acceptInvite" data-group="' + groupObject.name + '"><i class="fa fa-plus"></i> [[groups:membership.accept-invitation]]</button>';
		}

		if (!groupObject.disableJoinRequests && groupObject.name !== 'administrators') {
			return '<button class="btn btn-success" data-action="join" data-group="' + groupObject.displayName + '"><i class="fa fa-plus"></i> [[groups:membership.join-group]]</button>';
		}

		return '';
	}

	function spawnPrivilegeStates(member, privileges) {
		const states = [];
		for (const priv in privileges) {
			if (privileges.hasOwnProperty(priv)) {
				states.push({
					name: priv,
					state: privileges[priv],
				});
			}
		}

		return states.map(priv => {
			const guestDisabled = ['groups:moderate', 'groups:posts:upvote', 'groups:posts:downvote', 'groups:local:login', 'groups:group:create'];
			const spidersEnabled = ['groups:find', 'groups:read', 'groups:topics:read', 'groups:view:users', 'groups:view:tags', 'groups:view:groups'];
			const globalModuleDisabled = ['groups:moderate'];
			const disabled
                = (member === 'guests' && (guestDisabled.includes(priv.name) || priv.name.startsWith('groups:admin:')))
                || (member === 'spiders' && !spidersEnabled.includes(priv.name))
                || (member === 'Global Moderators' && globalModuleDisabled.includes(priv.name));

			return '<td class="text-center" data-privilege="' + priv.name + '" data-value="' + priv.state + '"><input autocomplete="off" type="checkbox"' + (priv.state ? ' checked' : '') + (disabled ? ' disabled="disabled"' : '') + ' /></td>';
		}).join('');
	}

	function localeToHTML(locale, fallback) {
		locale ||= fallback || 'en-GB';
		return locale.replace('_', '-');
	}

	function renderTopicImage(topicObject) {
		if (topicObject.thumb) {
			return '<img src="' + topicObject.thumb + '" class="img-circle user-img" title="' + topicObject.user.username + '" />';
		}

		return '<img component="user/picture" data-uid="' + topicObject.user.uid + '" src="' + topicObject.user.picture + '" class="user-img" title="' + topicObject.user.username + '" />';
	}

	function renderTopicEvents(index, sort) {
		if (sort === 'most_votes') {
			return '';
		}

		const start = this.posts[index].eventStart;
		const end = this.posts[index].eventEnd;
		const events = this.events.filter(event => event.timestamp >= start && event.timestamp < end);
		if (events.length === 0) {
			return '';
		}

		return renderEvents.call(this, events);
	}

	function renderEvents(events) {
		return events.reduce((html, event) => {
			html += `<li component="topic/event" class="timeline-event" data-topic-event-id="${event.id}" data-topic-event-type="${event.type}">
                <div class="timeline-badge">
                    <i class="fa ${event.icon || 'fa-circle'}"></i>
                </div>
                <span class="timeline-text">
                    ${event.href ? `<a href="${relative_path}${event.href}">${event.text}</a>` : event.text}&nbsp;
                </span>
            `;

			if (event.user) {
				html += event.user.system ? '<span class="timeline-text">[[global:system-user]]</span>&nbsp;' : `<span><a href="${relative_path}/user/${event.user.userslug}">${buildAvatar(event.user, 'xs', true)}&nbsp;${event.user.username}</a></span>&nbsp;`;
			}

			html += `<span class="timeago timeline-text" title="${event.timestampISO}"></span>`;

			if (this.privileges.isAdminOrMod) {
				html += `&nbsp;<span component="topic/event/delete" data-topic-event-id="${event.id}" data-topic-event-type="${event.type} class="timeline-text pointer" title="[[topic:delete-event]]"><i class="fa fa-trash"></i></span>`;
			}

			return html;
		}, '');
	}

	function renderDigestAvatar(block) {
		if (block.teaser) {
			if (block.teaser.user.picture) {
				return '<img style="vertical-align: middle; width: 32px; height: 32px; border-radius: 50%;" src="' + block.teaser.user.picture + '" title="' + block.teaser.user.username + '" />';
			}

			return '<div style="vertical-align: middle; width: 32px; height: 32px; line-height: 32px; font-size: 16px; background-color: ' + block.teaser.user['icon:bgColor'] + '; color: white; text-align: center; display: inline-block; border-radius: 50%;">' + block.teaser.user['icon:text'] + '</div>';
		}

		if (block.user.picture) {
			return '<img style="vertical-align: middle; width: 32px; height: 32px; border-radius: 50%;" src="' + block.user.picture + '" title="' + block.user.username + '" />';
		}

		return '<div style="vertical-align: middle; width: 32px; height: 32px; line-height: 32px; font-size: 16px; background-color: ' + block.user['icon:bgColor'] + '; color: white; text-align: center; display: inline-block; border-radius: 50%;">' + block.user['icon:text'] + '</div>';
	}

	function userAgentIcons(data) {
		let icons = '';

		switch (data.platform) {
			case 'Linux': {
				icons += '<i class="fa fa-fw fa-linux"></i>';
				break;
			}

			case 'Microsoft Windows': {
				icons += '<i class="fa fa-fw fa-windows"></i>';
				break;
			}

			case 'Apple Mac': {
				icons += '<i class="fa fa-fw fa-apple"></i>';
				break;
			}

			case 'Android': {
				icons += '<i class="fa fa-fw fa-android"></i>';
				break;
			}

			case 'iPad': {
				icons += '<i class="fa fa-fw fa-tablet"></i>';
				break;
			}

			case 'iPod': // Intentional fall-through
			case 'iPhone': {
				icons += '<i class="fa fa-fw fa-mobile"></i>';
				break;
			}

			default: {
				icons += '<i class="fa fa-fw fa-question-circle"></i>';
				break;
			}
		}

		switch (data.browser) {
			case 'Chrome': {
				icons += '<i class="fa fa-fw fa-chrome"></i>';
				break;
			}

			case 'Firefox': {
				icons += '<i class="fa fa-fw fa-firefox"></i>';
				break;
			}

			case 'Safari': {
				icons += '<i class="fa fa-fw fa-safari"></i>';
				break;
			}

			case 'IE': {
				icons += '<i class="fa fa-fw fa-internet-explorer"></i>';
				break;
			}

			case 'Edge': {
				icons += '<i class="fa fa-fw fa-edge"></i>';
				break;
			}

			default: {
				icons += '<i class="fa fa-fw fa-question-circle"></i>';
				break;
			}
		}

		return icons;
	}

	function buildAvatar(userObject, size, rounded, classNames, component) {
		/**
         * UserObj requires:
         *   - uid, picture, icon:bgColor, icon:text (getUserField w/ "picture" should return all 4), username
         * size: one of "xs", "sm", "md", "lg", or "xl" (required), or an integer
         * rounded: true or false (optional, default false)
         * classNames: additional class names to prepend (optional, default none)
         * component: overrides the default component (optional, default none)
         */

		// Try to use root context if passed-in userObj is undefined
		userObject ||= this;

		const attributes = [
			'alt="' + userObject.username + '"',
			'title="' + userObject.username + '"',
			'data-uid="' + userObject.uid + '"',
			'loading="lazy"',
		];
		const styles = [];
		classNames ||= '';

		// Validate sizes, handle integers, otherwise fall back to `avatar-sm`
		if (['xs', 'sm', 'sm2x', 'md', 'lg', 'xl'].includes(size)) {
			classNames += ' avatar-' + size;
		} else if (isNaN(Number.parseInt(size, 10))) {
			classNames += ' avatar-sm';
		} else {
			styles.push('width: ' + size + 'px;', 'height: ' + size + 'px;', 'line-height: ' + size + 'px;', 'font-size: ' + (Number.parseInt(size, 10) / 16) + 'rem;');
		}

		attributes.unshift('class="avatar ' + classNames + (rounded ? ' avatar-rounded' : '') + '"');

		// Component override
		if (component) {
			attributes.push('component="' + component + '"');
		} else {
			attributes.push('component="avatar/' + (userObject.picture ? 'picture' : 'icon') + '"');
		}

		if (userObject.picture) {
			return '<img ' + attributes.join(' ') + ' src="' + userObject.picture + '" style="' + styles.join(' ') + '" />';
		}

		styles.push('background-color: ' + userObject['icon:bgColor'] + ';');
		return '<span ' + attributes.join(' ') + ' style="' + styles.join(' ') + '">' + userObject['icon:text'] + '</span>';
	}

	function register() {
		for (const helperName of Object.keys(helpers)) {
			Benchpress.registerHelper(helperName, helpers[helperName]);
		}
	}

	return helpers;
};
