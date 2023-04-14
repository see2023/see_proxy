// chat gpt proxy with ChatGPTAPI
import { ChatGPTAPI } from 'chatgpt'
import KeyvRedis from '@keyv/redis'
import Keyv from 'keyv'
import proxy from "https-proxy-agent";
import nodeFetch from "node-fetch";
import logger from './log.js';

class ChatgptProxy {
	constructor() {
		this._REDIS_PREFIX = 'chatgpt:'
		this._debug = true;
		// this._defaultModel = 'text-davinci-003';
		this._defaultModel = 'gpt-3.5-turbo';
		this._openai_api_key = process.env.OPENAI_API_KEY;
		this._store
		this._messagestore
		this._gpt

	}
	async init() {
		const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
		this._store = new KeyvRedis(redisUrl)
		this._messageStore = new Keyv({ store: this._store, namespace: 'chatgpt-cache' })
		this._gpt = new ChatGPTAPI({
			apiKey: this._openai_api_key,
			temperature: 0.5,
			debug: this._debug,
			completionParams: {
				model: this._defaultModel
			},
			messageStore: this._messageStore,
			fetch: (url, options = {}) => {
				const defaultOptions = {
				};
				if (process.env.HTTPS_PROXY) {
					defaultOptions.agent = proxy(process.env.HTTPS_PROXY);
					logger.debug(`using proxy: ${process.env.HTTPS_PROXY}`);
				}
				const mergedOptions = {
					...defaultOptions,
					...options,
				};
				return nodeFetch(url, mergedOptions);
			},
		})
	}
	async sendMessage(text, modelInput, parentMessageId, systemMessage) {
		/*
		request: {
		  text: 'hello',
		  parentMessageId: lastMessageI.id,  // optional
		  model: 'text-davinci-003', // optional, default gpt-3.5-turbo
		}
		response: {
		  role: 'assistant',
		  id: 'cmpl-....',
		  parentMessageId: '6dd354ac-ab49-4119-b0b0-...',
		  conversationId: 'f5848cf9-c68d-4bf1-a13e-..l',
		  text: ''
		  detail: {
			id: 'cmpl-...',
			object: 'text_completion',
			created: 1676346410,
			model: 'gpt-3.5-turbo',
			choices: [ [Object] ],
			usage: { prompt_tokens: 117, completion_tokens: 259, total_tokens: 376 }
		  }
		}
		*/
		logger.debug(`chatgpt request, modelInput: ${modelInput}, parentMessageId: ${parentMessageId}`)
		let model = this._defaultModel;
		if (modelInput && modelInput.match(/^[A-Za-z0-9-]+$/)) {
			model = modelInput;
		}
		this._gpt.model = model;
		let opts = {};
		if (parentMessageId) {
			opts.parentMessageId = parentMessageId;
		}
		if (systemMessage) {
			opts.systemMessage = systemMessage;
		}

		// get chatgpt response
		let rt
		rt = await this._gpt.sendMessage(text, opts);
		logger.info(`chatgpt response ${rt.text}`)
		return rt;
	}
}

export default ChatgptProxy