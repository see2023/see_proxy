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
apt install redis-server
redis-cli HSET chatgpt:your_username key your_key amount 10000
# set your_username-your_key in app

```

* Start 
```
# set OPENAI_API_KEY and AZURE_TTS_KEY in system environment variable'
npm i
npm start

```