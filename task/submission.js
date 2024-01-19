const { namespaceWrapper } = require('../_koiiNode/koiiNode');
const { TickerWatcher, scrapers } = require('@metex/trading-alerts');
const { SpheronClient, ProtocolEnum } = require('@spheron/storage');
const puppeteer = require('puppeteer');
const PCR = require('puppeteer-chromium-resolver');
const { writeFile } = require('fs/promises');
const { default: axios } = require('axios');

class Submission {
  task(round) {
    console.log(`beginning task for round ${round}`);
    this.performEnvCheck(process.env);

    // namespaceWrapper.getTaskState().stake_list;

    return new Promise(async (resolve) => {
      try {
        const metadata = await getTaskMetadata();
        console.log('retrieved metadata', JSON.stringify(metadata));
        const finalPriceSubmissionData = [];

        console.log(`launching browser...`);
        const stats = await PCR({});
        console.log(
          '*****************************************CALLED PURCHROMIUM RESOLVER*****************************************',
        );
        const browser = await stats.puppeteer.launch({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
          executablePath: stats.executablePath,
        });

        const TICKERS = metadata.tickers;
        if (!TICKERS) throw new Error('No tickers found in metadata');
        console.log('parsed TICKERS to the following value', TICKERS);

        const priceChangeHandler = async ({ ticker, initialPrice, price, delta, threshold }) => {
          console.log('price change!', ticker, initialPrice, price, delta);

          console.log(`[${ticker}]: creating page...`);
          const page = await browser.newPage();
          await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          );
          // TODO - Enable console logs in the context of the page and export them for diagnostics here
          await page.setViewport({ width: 1920, height: 1080 });
          console.log('metadata.scrapers', JSON.stringify(metadata.scrapers));
          console.log('detecting scrapersList...');
          /**
           * @type {Array<Scraper & {run: function}>}
           */
          const scrapersList = metadata.scrapers.reduce((acc, _scraper) => {
            const scraper = scrapers[_scraper.name];
            if (!scraper) {
              console.log(`[${ticker}]: scraper ${_scraper.name} not found in scrapers`);
              return acc;
            }
            return [...acc, { ..._scraper, run: scraper }];
          }, []);
          console.log('got scrapersList!', scrapersList);

          console.log(`[${ticker}]: getting articles...`);
          const articles = [];
          for (const scraper of scrapersList)
            articles.push(
              ...((await scraper.run({ page, ticker, keywords: scraper.keywords })) ?? []),
            );
          console.log(`[${ticker}]: got articles!`, articles);
          page.close();

          let text = `[${ticker}]: Price change from ${initialPrice} to ${price} exceeds threshold (${
            threshold * 100
          }%): ${(delta * 100).toFixed(2)}%`;

          if (!!articles?.length)
            text += `\n\n*Possibly related articles*
              \r${articles.map(({ title, url }) => `• <${url}|${title}>`).join('\n')}
            `;

          // store results to be published later
          const storeData = {
            ticker,
            initialPrice,
            price,
            delta,
            threshold,
            articles,
          };
          console.log(
            'storing the following data into the finalPriceSubmissionData variable',
            storeData,
          );
          finalPriceSubmissionData.push(storeData);
        };

        const threshold = metadata.threshold ?? 0.03;
        console.log(`Threshold incoming as ${metadata.threshold}, set to ${threshold}`);
        const watchers = TICKERS.map(
          (ticker) =>
            new TickerWatcher({
              token: process.env.TIINGO_TOKEN,
              ticker,
              threshold,
              // duration: 5000,
            }),
        );
        watchers.forEach((watcher) => watcher.on('priceChange', priceChangeHandler));

        watchers.forEach((watcher) =>
          watcher.on('open', () => console.log(`watcher opened ${watcher.ticker}`)),
        );

        const finalStoreData = {};
        watchers.forEach((watcher) =>
          watcher.on('close', ({ initialPrice, lastPrice }) => {
            console.log(`watcher closed ${watcher.ticker}`, initialPrice, lastPrice);
            // set the store with the key of ticker and the value of endprice?
            finalStoreData[watcher.ticker] = lastPrice;
          }),
        );

        setTimeout(async () => {
          console.log('in setTimeout');
          console.log('closing browser...');
          await browser.close();
          console.log('uploading file to IPFS...');
          const cid = await this.storeData(finalPriceSubmissionData);
          console.log('writing data to stores...');
          await namespaceWrapper.storeSet('cid', cid);
          await namespaceWrapper.storeSet('endPrices', finalStoreData);
          void resolve(finalStoreData);
        }, 90000 + 1000);
      } catch (err) {
        console.log('ERROR IN EXECUTING TASK', err);
        void resolve('ERROR IN EXECUTING TASK' + err);
      }
    });
  }

  async submitTask(roundNumber) {
    console.log('submitTask called with round', roundNumber);
    try {
      console.log('inside submitTask try');
      console.log(await namespaceWrapper.getSlot(), 'current slot while calling submit');
      const submission = await this.fetchSubmission(roundNumber);
      console.log('SUBMISSION', submission);
      await namespaceWrapper.checkSubmissionAndUpdateRound(submission, roundNumber);
      console.log('after the submission call');
      return submission;
    } catch (error) {
      console.log('error in submission', error);
    }
  }

  async fetchSubmission(round) {
    // Write the logic to fetch the submission values here and return the cid string

    // fetching round number to store work accordingly

    console.log(`IN FETCH SUBMISSION, round number ${round}`);

    // The code below shows how you can fetch your stored value from level DB

    const cid = await namespaceWrapper.storeGet('cid'); // retrieves the value
    console.log('VALUE (cid)', cid);
    return cid;
  }

  async storeData(data) {
    try {
      let cid;
      const client = new SpheronClient({ token: process.env.SPHERON_KEY });
      let path = 'data.json';
      let basePath = '';
      try {
        basePath = await namespaceWrapper.getBasePath();
        await writeFile(`${basePath}/${path}`, JSON.stringify(data));
      } catch (err) {
        console.log('writeFile error', err);
      }

      try {
        // console.log(`${basePath}/${path}`)
        let spheronData = await client.upload(`${basePath}/${path}`, {
          protocol: ProtocolEnum.IPFS,
          name: 'data.json',
          onUploadInitiated: (uploadId) => {
            console.log(`Upload with id ${uploadId} started...`);
          },
          onChunkUploaded: (uploadedSize, totalSize) => {
            console.log(`Uploaded ${uploadedSize} of ${totalSize} Bytes.`);
          },
        });
        cid = spheronData.cid;
      } catch (err) {
        console.log('error uploading to IPFS, trying again', err);
      }
      return cid;
    } catch (e) {
      console.log('Error storing files', e);
    }
  }

  performEnvCheck(env) {
    const vars = ['TIINGO_TOKEN', 'SPHERON_KEY'];
    for (const key of vars) if (!env[key]) throw new Error(`Missing environment variable ${key}`);
  }
}

/**
 * @typedef {object} Metadata Task metadata
 * @prop {string} version
 * @prop {Array<string>} tickers
 * @prop {number} threshold
 * @prop {Array<Scraper>} scrapers
 */
/**
 * @typedef {object} Scraper Scraper data object
 * @prop {string} name
 * @prop {Array<string>} keywords
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @returns {Promise<Metadata>}
 */
const getTaskMetadata = async (maxRetries = 3, retryDelay = 3000) => {
  const url = 'https://elijaholmos.github.io/metex-trading-alerts-task/metadata.json';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(url);
      if (response.status === 200) {
        return response.data;
      } else {
        console.log(`Attempt ${attempt}: Received status ${response.status}`);
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) {
        console.log(`Waiting for ${retryDelay / 1000} seconds before retrying...`);
        await sleep(retryDelay);
      } else {
        return false; // Rethrow the last error
      }
    }
  }
};

const submission = new Submission();
module.exports = { submission };
