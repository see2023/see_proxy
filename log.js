import pino from 'pino';

export default pino({
	transport: {
		target: 'pino-pretty',
		options: {
			colorize: true,
			translateTime: 'SYS:standard',
		},
	},
	level: process.env.PINO_LOG_LEVEL || 'debug', // debug, info, warn, error
});