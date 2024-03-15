'use strict';

const user = require('../../user');
const meta = require('../../meta');
const helpers = require('../helpers');
const groups = require('../../groups');
const privileges = require('../../privileges');
const file = require('../../file');
const accountHelpers = require('./helpers');

const editController = module.exports;

editController.get = async function (request, res, next) {
	const [userData, canUseSignature] = await Promise.all([
		accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query),
		privileges.global.can('signature', request.uid),
	]);
	if (!userData) {
		return next();
	}

	userData.maximumSignatureLength = meta.config.maximumSignatureLength;
	userData.maximumAboutMeLength = meta.config.maximumAboutMeLength;
	userData.maximumProfileImageSize = meta.config.maximumProfileImageSize;
	userData.allowProfilePicture = !userData.isSelf || Boolean(meta.config['reputation:disabled']) || userData.reputation >= meta.config['min:rep:profile-picture'];
	userData.allowCoverPicture = !userData.isSelf || Boolean(meta.config['reputation:disabled']) || userData.reputation >= meta.config['min:rep:cover-picture'];
	userData.allowProfileImageUploads = meta.config.allowProfileImageUploads;
	userData.allowedProfileImageExtensions = user.getAllowedProfileImageExtensions().map(extension => `.${extension}`).join(', ');
	userData.allowMultipleBadges = meta.config.allowMultipleBadges === 1;
	userData.allowAccountDelete = meta.config.allowAccountDelete === 1;
	userData.allowWebsite = !userData.isSelf || Boolean(meta.config['reputation:disabled']) || userData.reputation >= meta.config['min:rep:website'];
	userData.allowAboutMe = !userData.isSelf || Boolean(meta.config['reputation:disabled']) || userData.reputation >= meta.config['min:rep:aboutme'];
	userData.allowSignature = canUseSignature && (!userData.isSelf || Boolean(meta.config['reputation:disabled']) || userData.reputation >= meta.config['min:rep:signature']);
	userData.profileImageDimension = meta.config.profileImageDimension;
	userData.defaultAvatar = user.getDefaultAvatar();

	userData.groups = userData.groups.filter(g => g && g.userTitleEnabled && !groups.isPrivilegeGroup(g.name) && g.name !== 'registered-users');

	if (!userData.allowMultipleBadges) {
		userData.groupTitle = userData.groupTitleArray[0];
	}

	userData.groups.sort((a, b) => {
		const i1 = userData.groupTitleArray.indexOf(a.name);
		const i2 = userData.groupTitleArray.indexOf(b.name);
		if (i1 === -1) {
			return 1;
		}

		if (i2 === -1) {
			return -1;
		}

		return i1 - i2;
	});
	for (const group of userData.groups) {
		group.userTitle = group.userTitle || group.displayName;
		group.selected = userData.groupTitleArray.includes(group.name);
	}

	userData.groupSelectSize = Math.min(10, Math.max(5, userData.groups.length + 1));

	userData.title = `[[pages:account/edit, ${userData.username}]]`;
	userData.breadcrumbs = helpers.buildBreadcrumbs([
		{
			text: userData.username,
			url: `/user/${userData.userslug}`,
		},
		{
			text: '[[user:edit]]',
		},
	]);
	userData.editButtons = [];
	res.render('account/edit', userData);
};

editController.password = async function (request, res, next) {
	await renderRoute('password', request, res, next);
};

editController.username = async function (request, res, next) {
	await renderRoute('username', request, res, next);
};

editController.email = async function (request, res, next) {
	const targetUid = await user.getUidByUserslug(request.params.userslug);
	if (!targetUid) {
		return next();
	}

	const [isAdminOrGlobalModule, canEdit] = await Promise.all([
		user.isAdminOrGlobalMod(request.uid),
		privileges.users.canEdit(request.uid, targetUid),
	]);

	if (!isAdminOrGlobalModule && !canEdit) {
		return next();
	}

	request.session.returnTo = `/uid/${targetUid}`;
	request.session.registration = request.session.registration || {};
	request.session.registration.updateEmail = true;
	request.session.registration.uid = targetUid;
	helpers.redirect(res, '/register/complete');
};

async function renderRoute(name, request, res, next) {
	const userData = await getUserData(request, next);
	if (!userData) {
		return next();
	}

	if (meta.config[`${name}:disableEdit`] && !userData.isAdmin) {
		return helpers.notAllowed(request, res);
	}

	if (name === 'password') {
		userData.minimumPasswordLength = meta.config.minimumPasswordLength;
		userData.minimumPasswordStrength = meta.config.minimumPasswordStrength;
	}

	userData.title = `[[pages:account/edit/${name}, ${userData.username}]]`;
	userData.breadcrumbs = helpers.buildBreadcrumbs([
		{
			text: userData.username,
			url: `/user/${userData.userslug}`,
		},
		{
			text: '[[user:edit]]',
			url: `/user/${userData.userslug}/edit`,
		},
		{
			text: `[[user:${name}]]`,
		},
	]);

	res.render(`account/edit/${name}`, userData);
}

async function getUserData(request) {
	const userData = await accountHelpers.getUserDataByUserSlug(request.params.userslug, request.uid, request.query);
	if (!userData) {
		return null;
	}

	userData.hasPassword = await user.hasPassword(userData.uid);
	return userData;
}

editController.uploadPicture = async function (request, res, next) {
	const userPhoto = request.files.files[0];
	try {
		const updateUid = await user.getUidByUserslug(request.params.userslug);
		const isAllowed = await privileges.users.canEdit(request.uid, updateUid);
		if (!isAllowed) {
			return helpers.notAllowed(request, res);
		}

		await user.checkMinReputation(request.uid, updateUid, 'min:rep:profile-picture');

		const image = await user.uploadCroppedPictureFile({
			callerUid: request.uid,
			uid: updateUid,
			file: userPhoto,
		});

		res.json([{
			name: userPhoto.name,
			url: image.url,
		}]);
	} catch (error) {
		next(error);
	} finally {
		await file.delete(userPhoto.path);
	}
};
