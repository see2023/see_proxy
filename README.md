# Install

Requirements:
* node >= v18
```
wget https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh
bash install.sh
source ~/.bashrc
nvm install v18
```

* Install redis, then init user info with 10000 coins
```
# apt install redis-server
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack-server:latest
# set your_username-your_key in app
redis-cli HSET chatgpt:your_username key your_key amount 10000

```

* Start 
```
# set OPENAI_API_KEY, AZURE_TTS_KEY, AZURE_SUBSCRIPTION_KEY in system environment variable'
npm i
npm start

```
