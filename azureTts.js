import logger from './log.js';
import { create } from 'xmlbuilder2';


// http client for microsoft azure text to speech api
// using fetch api
// https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/rest-text-to-speech?tabs=nonstreaming
class AzureTTS {
	constructor() {
		this._subscriptionKey = process.env.AZURE_TTS_KEY;
		this._region = process.env.AZURE_TTS_REGION ? process.env.AZURE_TTS_REGION : 'eastasia';
		this._token = null;
		this._tokenExpires = 0;
	}

	async refreshToken() {

		const url = `https://${this._region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': 0,
			'Ocp-Apim-Subscription-Key': this._subscriptionKey,
		};

		if (this._token && this._tokenExpires > Date.now()) {
			logger.debug(`refreshToken: token not expired`)
			return;
		}

		let res = await fetch(url, {
			method: 'post',
			headers: headers,
		})
		if (res.ok) {
			logger.info(`refreshToken ok`)
			let text = await res.text();
			this._token = text;
			this._tokenExpires = Date.now() + 9 * 60 * 1000;
			return;
		} else {
			logger.error(`refreshToken failed ${res.status} ${res.statusText}`);
			throw ('refresh token error')
		}
	}

	async textToSpeech(text, voiceName = 'zh-CN-XiaoyiNeural', outputFormat = 'riff-24khz-16bit-mono-pcm', style = 'cheerful', rate = '0%', pitch = '0%', volume = '0%') {
		await this.refreshToken()
		//	<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">
		//		<voice name="zh-CN-XiaoyiNeural">
		//			<mstts:express-as style="cheerful" >
		//				<prosody rate="35%" pitch="0%">hi！</prosody>
		//			</mstts:express-as>
		//		</voice>
		//	</speak>
		const obj = {
			speak: {
				'@xmlns': 'http://www.w3.org/2001/10/synthesis',
				'@xmlns:mstts': 'http://www.w3.org/2001/mstts',
				'@xmlns:emo': 'http://www.w3.org/2009/10/emotionml',
				'@version': '1.0',
				'@xml:lang': 'zh-CN',
				voice: {
					'@name': voiceName,
					'mstts:express-as': {
						'@style': style,
						prosody: {
							'@rate': rate,
							'@pitch': pitch,
							'@volume': volume,
							'#text': text,
						}
					}
				}
			}
		}
		const doc = create(obj)
		const xml = doc.end({ prettyPrint: true })
		logger.debug(xml)
		const url = `https://${this._region}.tts.speech.microsoft.com/cognitiveservices/v1`;
		const headers = {
			'Content-Type': 'application/ssml+xml',
			'X-Microsoft-OutputFormat': outputFormat,
			'Authorization': `Bearer ${this._token}`,
		}
		let res = await fetch(url, {
			method: 'post',
			headers: headers,
			body: xml,
		})
		if (res.ok) {
			logger.info(`textToSpeech ok`)
			let buf = await res.arrayBuffer();
			return Buffer.from(buf);
		} else {
			logger.error(`textToSpeech failed ${res.status} ${res.statusText}`);
			throw new Error(`textToSpeech failed ${res.status}`);
		}
	}

}

export { AzureTTS };
