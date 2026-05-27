const SteamFeed = require( './SteamFeed' );

class Steam {
    constructor ( userIdentifier, providerConfig, load ) {
        this.feed = new SteamFeed( userIdentifier, providerConfig, load );
        this.userIdentifier = userIdentifier;
    }

    async loadRecentPosts () {
        try {
            return await this.feed.loadRecentPosts();
        } catch ( feedError ) {
            console.error( feedError );

            return [];
        }
    }
}

module.exports = Steam;
