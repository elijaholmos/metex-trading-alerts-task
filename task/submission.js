const { namespaceWrapper } = require('../_koiiNode/koiiNode');
const { TickerWatcher, dynamicImport } = require('@metex/trading-alerts');
const { WebClient } = require('@slack/web-api');
const puppeteer = require('puppeteer');
const PCR = require('puppeteer-chromium-resolver');

class Submission {
  task(round) {
    // namespaceWrapper.getTaskState().stake_list;
    // how to use stores and track multiple stocks at once?

    return new Promise(async (resolve) => {
      try {
        const slack = new WebClient(process.env.SLACK_TOKEN);
        console.log(`launching browser...`);
        const options = {};
        const stats = await PCR(options);
        console.log(
          '*****************************************CALLED PURCHROMIUM RESOLVER*****************************************',
        );
        const browser = await stats.puppeteer.launch({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
          executablePath: stats.executablePath,
        });

        const TICKERS = ['AAPL', 'GME', 'MSFT', 'TWTR', 'TSLA', 'AMZN'];

        const priceChangeHandler = async ({ ticker, initialPrice, price, delta, threshold }) => {
          console.log('price change!', ticker, initialPrice, price, delta);

          console.log(`[${ticker}]: creating page...`);
          const page = await browser.newPage();
          await this.page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          );
          // TODO - Enable console logs in the context of the page and export them for diagnostics here
          await this.page.setViewport({ width: 1920, height: 1080 });
          console.log(`[${ticker}]: getting articles...`);
          const articles = await (
            await dynamicImport(
              'https://raw.githubusercontent.com/elijaholmos/trading-alerts/main/scrapers/bloomberg.js',
            )
          ).run({ page, ticker });
          console.log(`[${ticker}]: got articles!`, articles);
          page.close();

          let text = `[${ticker}]: Price change from ${initialPrice} to ${price} exceeds threshold (${
            threshold * 100
          }%): ${(delta * 100).toFixed(2)}%`;

          if (!!articles?.length)
            text += `\n\n*Possibly related articles*
              \r${articles.map(({ title, url }) => `• <${url}|${title}>`).join('\n')}
            `;

          await slack.chat.postMessage({
            channel: '#trading-alerts',
            text,
          });
        };

        const watchers = TICKERS.map(
          (ticker) =>
            new TickerWatcher({
              ticker,
              threshold: 0.0003,
              // duration: 5000,
            }),
        );
        watchers.forEach((watcher) => watcher.on('priceChange', priceChangeHandler));

        watchers.forEach((watcher) =>
          watcher.on('open', () => console.log(`watcher opened ${watcher.ticker}`)),
        );

        const finalStoreData = {};
        watchers.forEach((watcher) =>
          watcher.on('close', ({ initialPrice, endPrice }) => {
            console.log(`watcher closed ${watcher.ticker}`, initialPrice, endPrice);
            // set the store with the key of ticker and the value of endprice?
            finalStoreData[watcher.ticker] = endPrice;
          }),
        );

        setTimeout(async () => {
          await browser.close();
          await namespaceWrapper.storeSet('prices', finalStoreData);
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
      console.log('inside try');
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

    console.log('IN FETCH SUBMISSION');

    // The code below shows how you can fetch your stored value from level DB

    const value = await namespaceWrapper.storeGet('prices'); // retrieves the value
    console.log('VALUE (prices)', value);
    return value;
  }
}

const submission = new Submission();
module.exports = { submission };
