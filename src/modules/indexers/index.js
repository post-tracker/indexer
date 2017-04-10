const Reddit = require( './Reddit.js' );
const Twitter = require( './Twitter.js' );
const InvisionPowerboard = require( './InvisionPowerboard.js' );

module.exports = {
    Reddit: new Reddit(),
    Twitter: new Twitter(),
    InvisionPowerboard: new InvisionPowerboard(),
};
