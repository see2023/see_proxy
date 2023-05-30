import { createClient } from 'redis'

import { Md5 } from 'ts-md5';
import logger from './log.js';
import ChatgptProxy from './chatgptProxy.js';
import { AzureTTS } from './azureTts.js';
import { AzureTtsV2 } from './azureTtsV2.js';
import AzureBing from './azureBing.js';
import * as bson from 'bson';



if (process.env.OPENAI_API_KEY === undefined || process.env.AZURE_TTS_KEY === undefined) {
	logger.error('please set OPENAI_API_KEY and AZURE_TTS_KEY in system environment variable')
	process.exit(1)
}


let redisClient;

(async () => {
	redisClient = createClient();

	redisClient.on("error", (error) => logger.error(`Redis init Error : ${error}`));

	await redisClient.connect();
})();

// start express server
import express from 'express'
const app = express()
const PORT = 3000
const REDIS_PREFIX = 'chatgpt:'

const chatgptProxy = new ChatgptProxy();
chatgptProxy.init()
const azureTTS = new AzureTTS();
const azureTtsV2 = new AzureTtsV2();
const azureBing = new AzureBing();

app.use(express.json({ extended: true, limit: '1mb' }))
async function handle(req, res) {
	/*
	request: {
	  user: 'user1',
	  timestamp: 1676346410,
	  text: 'hello',
	  md5hash: '', // md5sum(user + key + timestamp + text)
	}
	response: from upstream
	}
	*/
	var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
	//check param
	const { user, timestamp, text, md5hash } = req.body
	if (!user || !timestamp || !text || !md5hash) {
		logger.info(`md5 & user & timestamp & text is required: ${req.body}`)
		res.status(400).send('md5 & user & timestamp & text is required')
		return
	}
	if (!user.match(/^[a-zA-Z0-9_]{1,32}$/)) {
		logger.info(`user is invalid, ${user}, ${ip}`)
		res.status(400).send('user is invalid')
		return
	}

	// check timestamp
	if (Math.abs(timestamp - Date.now() / 1000) > 60) {
		logger.info(`timestamp is invalid, ${timestamp}, ${ip}`)
		res.status(400).send('timestamp is invalid')
		return
	}

	//check user from redis
	const info = await redisClient.hGetAll(`${REDIS_PREFIX}${user}`)
	if (!info?.key || !info?.amount) {
		logger.info(`user key / amount error, ${info?.key}, ${info?.amount}, ${ip}`)
		res.status(400).send('user amount is invalid')
		return
	} else {
		// check md5
		let md5Str = `${user}${info.key}${timestamp}${text}`
		if (md5hash !== Md5.hashStr(md5Str)) {
			logger.info(`md5 is invalid, ${md5Str}, ${ip}`)
			res.status(400).send('md5 is invalid')
			return
		}
		logger.info(`user amount left ${info.amount} ${ip}`)
		await redisClient.hSet(`${REDIS_PREFIX}${user}`, 'amount', info.amount - 1)
	}
	logger.info(`got valid request from ${req.url} ${ip}, text: ${text}`);
	// logger.debug(req.body.model)
	// logger.debug(req.body.systemMessage)

	// get chatgpt response
	let rt = {}
	let binaryData
	try {
		switch (req.url) {
			case '/api/v1/chatgpt':
				rt = await chatgptProxy.sendMessage(text, req.body.model, req.body.parentMessageId, req.body.systemMessage, req.body.temperature)
				res.type('json')
				res.send(rt)
				break;
			case '/api/v1/azuretts':
				rt = await azureTTS.textToSpeech(text, req.body.voiceName, req.body.outputFormat, req.body.style,
					req.body.rate, req.body.pitch, req.body.volume)
				res.setHeader('content-type', 'audio/x-wav');
				res.send(rt)
				break;
			case '/api/v2/azurettsWithVisemes':
				let rtTTS = await azureTtsV2.textToSpeechAndVisemes(text, req.body.voiceName, req.body.outputFormat, req.body.role, req.body.style,
					req.body.rate, req.body.pitch, req.body.volume)
				rt.visemes = rtTTS.visemes;
				rt.audio = rtTTS.audio;
				logger.debug(`azure ttsWithVisemes success`)
				binaryData = bson.serialize(rt);
				res.setHeader('content-type', 'application/bson');
				res.send(binaryData)
				break;
			case '/api/v2/combined':
				rt = await chatgptProxy.sendMessage(text, req.body.model, req.body.parentMessageId, req.body.systemMessage, req.body.temperature)
				if (rt.id && rt.text?.length > 0) {
					try {
						let rtTTS = await azureTtsV2.textToSpeechAndVisemes(rt.text, req.body.voiceName, req.body.outputFormat, req.body.role, req.body.style,
							req.body.rate, req.body.pitch, req.body.volume)
						rt.visemes = rtTTS.visemes;
						rt.audio = rtTTS.audio;
						logger.debug(`azure tts success, audio is a ${typeof rt.audio}`)
					} catch (error) {
						logger.warn(`azure tts error: ${error}`)
					}
				} else {
					logger.warn(`chatgpt error: ${rt}`)
				}
				binaryData = bson.serialize(rt);
				res.setHeader('content-type', 'application/bson');
				res.send(binaryData)
				break;
			case '/api/v2/bing':
				let cacheKey = `${REDIS_PREFIX}:bing:${text}:${req.body.count}:${req.body.getPageCount}:${req.body.offset}`
				let cache = await redisClient.get(cacheKey)
				if (cache) {
					logger.debug(`got cache for ${cacheKey}`)
					res.type('json')
					// send jsonEncoded cache
					res.send(JSON.parse(cache))
					return
				}
				rt = await azureBing.search(text, req.body.count, req.body.getPageCount, req.body.offset);
				res.type('json')
				res.send(rt)
				await redisClient.set(cacheKey, JSON.stringify(rt), 'EX', 60 * 60 * 24)
				logger.debug(`set cache for ${cacheKey}`)
				break;
			default:
				logger.info(`got invalid api: ${req.url}`);
				res.status(404).send('api not found')
		}
	} catch (error) {
		logger.error(`${req.url}, api catch error: ${error}`)
		res.status(500).send('server busy!')
	}
}

app.post('*/api*', async (req, res) => {
	try {
		handle(req, res)
	} catch (error) {
		logger.error('handle error:', error)
		res.status(500).send('server busy!!!')
	}
})

app.listen(PORT, () => {
	logger.info(`server running on port ${PORT}`)
})
