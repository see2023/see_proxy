import logger from './log.js';
import proxy from "https-proxy-agent";
import nodeFetch from 'node-fetch';
import * as cheerio from 'cheerio';

class AzureBing {
	constructor() {
		this._subscriptionKey = process.env.AZURE_SUBSCRIPTION_KEY;
		this._options = {
		};
		if (process.env.HTTPS_PROXY) {
			this._options.agent = proxy(process.env.HTTPS_PROXY);
			logger.info(`AzureBing using proxy: ${process.env.HTTPS_PROXY}`);
		}
	}

	async search(query, count = 1, getPageCount = 0, offset = 0) {
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
				const cleanContent = content.replace(/\s*\n+\s*/g, '\n').replace(/ +/g, ' ');
				output[i].content = Buffer.from(cleanContent).toString('base64');
			}
			logger.info(output)
			return output
		} catch (error) {
			console.log('bing api Error: ' + error.message)
			return output
		}
	}


}

export default AzureBing;