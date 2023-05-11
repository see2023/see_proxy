import logger from './log.js';
import proxy from "https-proxy-agent";
import nodeFetch from 'node-fetch';
import * as cheerio from 'cheerio';
import ChatgptProxy from './chatgptProxy.js';
import { get_encoding } from "@dqbd/tiktoken";
const enc = get_encoding("gpt2");

class AzureBing {
	constructor() {
		this._subscriptionKey = process.env.AZURE_SUBSCRIPTION_KEY;
		this._options = {
		};
		if (process.env.HTTPS_PROXY) {
			this._options.agent = proxy(process.env.HTTPS_PROXY);
			logger.info(`AzureBing using proxy: ${process.env.HTTPS_PROXY}`);
		}
		this._chatgptProxy = new ChatgptProxy();
		this._chatgptProxy.init()
	}

	async search(query, count = 1, getPageCount = 0, offset = 0, doSummarize = true) {
		let output = {}
		try {
			if (getPageCount == 0) {
				getPageCount = count;
			}
			logger.debug('searching: ' + query)
			const response = await nodeFetch(
				'https://api.bing.microsoft.com/v7.0/search?q=' + encodeURIComponent(query) + '&count=' + count + '&offset=' + offset,
				{
					headers: { 'Ocp-Apim-Subscription-Key': this._subscriptionKey },
				}
			)
			const body = await response.json()
			logger.debug(body)
			// copy name, url, snippet, language, dateLastCrawled from body.webPages to output
			output = body.webPages.value.map((item) => {
				return {
					name: item.name,
					url: item.url,
					snippet: item.snippet,
					language: item.language,
					dateLastCrawled: item.dateLastCrawled,
				}
			})
			// fetch page contents
			for (let i = 0; i < getPageCount && i < body.webPages.value.length; i++) {
				logger.debug('fetching page: ' + i, body.webPages.value[i].url)
				const pageRes = await nodeFetch(body.webPages.value[i].url, this._options)
				logger.debug(body.webPages.value[i].url, 'Page response status: ' + pageRes.status)
				const text = await pageRes.text()
				let $ = cheerio.load(text, {
					decodeEntities: false,
				});
				$('script').remove();
				$('style').remove();
				const content = $('body').text();
				let cleanContent = content.replace(/\s*\n+\s*/g, '\n').replace(/ +/g, ' ');
				if (doSummarize) {
					logger.debug('summarizing page: ' + i, body.webPages.value[i].url)
					cleanContent = await this.summarize(body.webPages.value[i].name, body.webPages.value[i].snippet, cleanContent)
					logger.debug('summarized page: ' + i, body.webPages.value[i].url)
				}
				output[i].content = Buffer.from(cleanContent).toString('base64');
			}
			// logger.info(output)
			return output
		} catch (error) {
			console.log('bing api Error: ' + error.message)
			return output
		}
	}

	async summarize(name, snippet, content) {
		let sysPrompt = 'I will send you a text, please generate a summary of this text, return no more than 1024 tokens, just record the key content. Please reply in the same language as input.'
		let inputText = name + '\n' + snippet + '\n' + content;
		// cut inputText to N tokens, using @dqbd/tiktoken' to judge
		let tokens = enc.encode(inputText);
		const tokensCount = tokens.length;
		const max_context_length = 3000;
		if (tokensCount > max_context_length) {
			logger.debug('inputText too long, cut to 2048 tokens, from ' + tokensCount + ' to ' + max_context_length)
			tokens = tokens.slice(0, max_context_length);
			inputText = new TextDecoder().decode(enc.decode(tokens))
		}

		logger.debug('summarizing: ' + inputText)
		let rt = await this._chatgptProxy.sendMessage(inputText, '', undefined, sysPrompt)
		//   rt = await chatgptProxy.sendMessage(text, req.body.model, req.body.parentMessageId, req.body.systemMessage)
		if (rt && rt.text) {
			logger.debug('summarized: ' + rt.text)
			return rt.text;
		}
		logger.warn('summarizing failed', rt)
		return ''
	}


}

export default AzureBing;