import logger from './log.js';
import { create } from 'xmlbuilder2';
import sdk from "microsoft-cognitiveservices-speech-sdk";


// https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/rest-text-to-speech?tabs=nonstreaming
// https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/how-to-speech-synthesis-viseme?pivots=programming-language-javascript&tabs=3dblendshapes
// https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support?tabs=tts
// https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/speech-synthesis-markup-voice#speaking-styles-and-roles
class AzureTtsV2 {
	constructor() {
		this._subscriptionKey = process.env.AZURE_TTS_KEY;
		this._region = process.env.AZURE_TTS_REGION ? process.env.AZURE_TTS_REGION : 'eastasia';
	}


	async textToSpeechAndVisemes(text, voiceName = 'zh-CN-XiaoyiNeural', outputFormat = 'riff-24khz-16bit-mono-pcm', role = ' ', style = 'cheerful', rate = '0%', pitch = '0%', volume = '0%') {
		const obj = {
			speak: {
				'@xmlns': 'http://www.w3.org/2001/10/synthesis',
				'@xmlns:mstts': 'http://www.w3.org/2001/mstts',
				'@xmlns:emo': 'http://www.w3.org/2009/10/emotionml',
				'@version': '1.0',
				'@xml:lang': 'zh-CN',
				voice: {
					'@name': voiceName,
					'mstts:viseme': {
						'@type': 'FacialExpression'
					},
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
		if (role && role.length > 1) {
			obj.speak.voice['mstts:express-as']['@role'] = role;
		}
		const doc = create(obj)
		const xml = doc.end({ prettyPrint: true })
		logger.debug(xml)
		return new Promise((resolve, reject) => {
			const speechConfig = sdk.SpeechConfig.fromSubscription(this._subscriptionKey, this._region);
			const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
			// how to resuse synthesizer?
			let blendShapes = [];
			synthesizer.visemeReceived = function (s, e) {
				if (e.animation?.length > 0) {
					let j = JSON.parse(e.animation);
					for (let i = 0; i < j.BlendShapes.length; i++) {
						for (let k = 0; k < j.BlendShapes[i].length; k++) {
							j.BlendShapes[i][k] = j.BlendShapes[i][k] * 1000;
						}
					}
					blendShapes = blendShapes.concat(j.BlendShapes);
				}
			}
			synthesizer.speakSsmlAsync(xml, result => {
				if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
					logger.info("Speech synthesized to speaker for text [ " + text + " ], audio length: "
						+ result.audioData.byteLength + " bytes, visemes: " + blendShapes.length + " frames")
					resolve({ audio: Buffer.from(result.audioData), visemes: JSON.stringify(blendShapes) });
				} else {
					logger.warn("Speech synthesis canceled, result.reason: " + result.reason + ', detail: ' + result.errorDetails);
					reject(result);
				}
			}, error => {
				logger.error("Speech synthesis failed, " + error);
				reject(error);
			});
		})
	}
}

export { AzureTtsV2 };
