// eslint-disable global-require
module.exports = {
    'Bungie.net': require( './BungieNet.js' ),
    InvisionPowerBoard: require( './InvisionPowerBoard.js' ),
    SimpleMachinesForum: require( './SimpleMachinesForum.js' ),
    Steam: require( './Steam.js' ),
    Twitter: require( './Twitter.js' ),
    rsi: require( './rsi.js' ),
    Instagram: require( './Instagram.js' ),
    // BattleNet (Hearthstone) and Discourse (Conan, Last Epoch) moved to the
    // grunt/peon pipeline's unified `discourse` indexer; removed here so the
    // legacy indexer no longer double-processes them.
    CommLink: require( './CommLink.js' ),
};
