const { namespaceWrapper } = require('../_koiiNode/koiiNode');

class Audit {
  async validateNode(submission_value, round) {
    // Write your logic for the validation of submission value here and return a boolean value in response

    // The sample logic can be something like mentioned below to validate the submission
    console.log('SUBMISSION VALUE', submission_value, round);
    try {
      if (submission_value == 'null' || submission_value == null)
        // For successful flow we return true (Means the audited node submission is correct)
        return true;
      // For unsuccessful flow we return false (Means the audited node submission is incorrect)
      // Submission value should have every key on the object
      else
        return ['ticker', 'initialPrice', 'price', 'delta', 'threshold', 'articles'].every((key) =>
          Object.hasOwn(JSON.parse(submission_value), key),
        );
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
const audit = new Audit();
module.exports = { audit };
