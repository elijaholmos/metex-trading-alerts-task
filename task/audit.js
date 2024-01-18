const { namespaceWrapper } = require('../_koiiNode/koiiNode');
const { default: axios } = require('axios');

class Audit {
  async validateNode(submission_value, round) {
    // Write your logic for the validation of submission value here and return a boolean value in response

    // The sample logic can be something like mentioned below to validate the submission
    console.log('SUBMISSION VALUE', submission_value, round);

    try {
      const data = await getJSONFromCID(submission_value, 'data.json');
      console.log('data', data);
      if (!data) return false;
      // For unsuccessful flow we return false (Means the audited node submission is incorrect)
      // Submission value should have every key on the object
      else {
        if (!Array.isArray(data)) return false;
        for (const el of data)
          if (
            !['ticker', 'initialPrice', 'price', 'delta', 'threshold', 'articles'].every((key) =>
              Object.hasOwn(el, key),
            )
          )
            return false;
        console.log('successful submision detected, returning true');
        return true;
      }
    } catch (e) {
      console.error('validateNode error', e);
      return false;
    }
    return false;
  }

  async auditTask(roundNumber) {
    console.log('auditTask called with round', roundNumber);
    console.log(await namespaceWrapper.getSlot(), 'current slot while calling auditTask');
    await namespaceWrapper.validateAndVoteOnNodes(this.validateNode, roundNumber);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getJSONFromCID = async (cid, fileName, maxRetries = 3, retryDelay = 3000) => {
  let url = `https://${cid}.ipfs.dweb.link/${fileName}`;
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

const audit = new Audit();
module.exports = { audit };
