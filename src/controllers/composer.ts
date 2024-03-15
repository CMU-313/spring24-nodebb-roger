// This is one of the two example TypeScript files included with the NodeBB repository
// It is meant to serve as an example to assist you with your HW1 translation

import nconf from 'nconf';
import {type Request, type Response, type NextFunction} from 'express';
import {type TopicObject} from '../types';
import user from '../user';
import plugins from '../plugins';
import topics from '../topics';
import posts from '../posts';
import helpers from './helpers.js';

type ComposerBuildData = {
	templateData: TemplateData;
};

type TemplateData = {
	title: string;
	disabled: boolean;
};

type Locals = {
	metaTags: Record<string, string>;
};

export async function get(request: Request, res: Response<Record<string, unknown>, Locals>, callback: NextFunction): Promise<void> {
	res.locals.metaTags = {
		...res.locals.metaTags,
		name: 'robots',
		content: 'noindex',
	};

	const data: ComposerBuildData = await plugins.hooks.fire('filter:composer.build', {
		req: request,
		res,
		next: callback,
		templateData: {},
	}) as ComposerBuildData;

	if (res.headersSent) {
		return;
	}

	if (!data?.templateData) {
		return callback(new Error('[[error:invalid-data]]'));
	}

	if (data.templateData.disabled) {
		res.render('', {
			title: '[[modules:composer.compose]]',
		});
	} else {
		data.templateData.title = '[[modules:composer.compose]]';
		res.render('compose', data.templateData);
	}
}

type ComposerData = {
	uid: number;
	req: Request<Record<string, unknown>, Record<string, unknown>, ComposerData>;
	timestamp: number;
	content: string;
	fromQueue: boolean;
	tid?: number;
	cid?: number;
	title?: string;
	tags?: string[];
	thumb?: string;
	noscript?: string;
};

type QueueResult = {
	uid: number;
	queued: boolean;
	topicData: TopicObject;
	pid: number;
};

type PostFunctionType = (data: ComposerData) => Promise<QueueResult>;

export async function post(request: Request<Record<string, unknown>, Record<string, unknown>, ComposerData> & {uid: number}, res: Response): Promise<void> {
	const {body} = request;
	const data: ComposerData = {
		uid: request.uid,
		req: request,
		timestamp: Date.now(),
		content: body.content,
		fromQueue: false,
	};
	request.body.noscript = 'true';

	if (!data.content) {
		return await helpers.noScriptErrors(request, res, '[[error:invalid-data]]', 400) as Promise<void>;
	}

	async function queueOrPost(postFunction: PostFunctionType, data: ComposerData): Promise<QueueResult> {
		// The next line calls a function in a module that has not been updated to TS yet
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		const shouldQueue: boolean = await posts.shouldQueue(request.uid, data) as boolean;
		if (shouldQueue) {
			delete data.req;

			// The next line calls a function in a module that has not been updated to TS yet
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			return await posts.addToQueue(data) as QueueResult;
		}

		return postFunction(data);
	}

	try {
		let result: QueueResult;
		if (body.tid) {
			data.tid = body.tid;
			result = await queueOrPost(topics.reply as PostFunctionType, data);
		} else if (body.cid) {
			data.cid = body.cid;
			data.title = body.title;
			data.tags = [];
			data.thumb = '';
			result = await queueOrPost(topics.post as PostFunctionType, data);
		} else {
			throw new Error('[[error:invalid-data]]');
		}

		if (result.queued) {
			return res.redirect(`${nconf.get('relative_path') as string || '/'}?noScriptMessage=[[success:post-queued]]`);
		}

		const uid: number = result.uid ? result.uid : result.topicData.uid;

		// The next line calls a function in a module that has not been updated to TS yet
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call
		user.updateOnlineUsers(uid);

		const path: string = result.pid ? `/post/${result.pid}` : `/topic/${result.topicData.slug}`;
		res.redirect((nconf.get('relative_path') as string) + path);
	} catch (error: unknown) {
		if (error instanceof Error) {
			await helpers.noScriptErrors(request, res, error.message, 400);
		}
	}
}
